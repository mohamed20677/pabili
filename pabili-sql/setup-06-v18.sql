-- Pabili PH — V18: errands (a courier buys it at ANY shop). Run AFTER setup-05. Safe to re-run.

alter table orders add column if not exists budget numeric;   -- optional "don't spend more than" hint from the customer

-- Settlement now knows about errands: the courier fronts the item price at the shop, so the customer pays it
-- back through the courier (wallet: credited to the courier together with the fee; cash: the customer hands it over).
-- Commission stays on the delivery fee only; there is no store, so no vendor commission.
create or replace function settle_order(p_order uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; cm jsonb;
  c_pct numeric; v_pct numeric; d_pct numeric;
  prc numeric; fee numeric;
  c_fee numeric := 0; v_comm numeric := 0; d_comm numeric := 0; c_total numeric := 0;
begin
  select * into o from orders where id = p_order for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'order not found'); end if;
  if o.settled then return jsonb_build_object('ok', true, 'already', true); end if;
  if o.status <> 'delivered' then return jsonb_build_object('ok', false, 'error', 'order is not delivered yet'); end if;

  select v into cm from settings where k = 'commissions';
  c_pct := coalesce((cm->>'customer_pct')::numeric, 3);
  v_pct := coalesce((cm->>'vendor_pct')::numeric, 8);
  d_pct := coalesce((cm->>'driver_pct')::numeric, 10);

  fee := coalesce(o.fee, 0);
  prc := case when o.kind = 'ride' then 0 else coalesce(o.price, 0) end;
  d_comm := round(fee * d_pct / 100, 2);
  if o.kind = 'order' then v_comm := round(prc * v_pct / 100, 2); end if;
  if o.kind <> 'ride' and o.pay_via = 'wallet' then c_fee := round(fee * c_pct / 100, 2); end if;
  c_total := prc + fee + c_fee;

  if o.pay_via = 'wallet' then
    perform _wallet_move(o.customer_phone, -c_total, 'payment', o.id, 'Payment');
    if o.vendor_phone is not null and prc > 0 then
      perform _wallet_move(o.vendor_phone, prc - v_comm, 'sale', o.id, 'Sale (net of commission)');
    end if;
    if o.driver_phone is not null then
      perform _wallet_move(o.driver_phone,
        fee - d_comm + case when o.kind = 'errand' then prc else 0 end,
        'delivery', o.id, case when o.kind = 'errand' then 'Errand: item refund + fee (net of commission)' else 'Trip / delivery (net of commission)' end);
    end if;
  else
    if o.vendor_phone is not null and v_comm > 0 then
      perform _wallet_move(o.vendor_phone, -v_comm, 'commission', o.id, 'Commission (cash order)');
    end if;
    if o.driver_phone is not null and d_comm > 0 then
      perform _wallet_move(o.driver_phone, -d_comm, 'commission', o.id, 'Commission (cash order)');
    end if;
  end if;

  update orders set status = 'completed', settled = true, updated_at = now(),
    settlement = jsonb_build_object('pay_via', o.pay_via, 'customer_total', c_total, 'customer_fee', c_fee,
                                    'vendor_commission', v_comm, 'driver_commission', d_comm)
  where id = o.id;
  return jsonb_build_object('ok', true, 'total', c_total);
end $$;

grant execute on function settle_order(uuid) to anon, authenticated;

-- Verify:  select column_name from information_schema.columns where table_name='orders' and column_name='budget';
