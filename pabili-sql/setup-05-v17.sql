-- Pabili PH — V17: real multi-phone engine (orders + rides + stores + approvals + wallet settlement).
-- Paste into the Supabase SQL editor AFTER setup-01 … setup-04. Safe to re-run.

-- 1) profiles: role approvals + vehicle shown to passengers
alter table profiles
  add column if not exists driver_status text default 'none',   -- none | pending | approved | rejected
  add column if not exists vendor_status text default 'none',
  add column if not exists vehicle text,
  add column if not exists plate text,
  add column if not exists avatar_url text;

-- 2) stores (one per owner for now)
create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  owner_phone text references profiles(phone) on delete cascade,
  name text not null,
  category text not null,
  area text, address text,
  lat numeric, lng numeric,
  rating numeric default 0,
  active boolean default false,     -- admin approval
  open boolean default false,       -- owner toggle
  featured boolean default false,
  created_at timestamptz default now()
);
create unique index if not exists stores_owner_uidx on stores (owner_phone);

-- 3) orders: one table for store orders AND rides
alter table orders
  add column if not exists kind text default 'order',            -- 'order' | 'ride'
  add column if not exists customer_name text,
  add column if not exists driver_name text,
  add column if not exists driver_vehicle text,
  add column if not exists awaiting text,                          -- who must answer next: vendor | customer | driver
  add column if not exists offer_to text,                          -- driver currently holding the offer
  add column if not exists offer_deadline timestamptz,
  add column if not exists declined text[] default '{}',
  add column if not exists pay_via text default 'cash',           -- cash | wallet
  add column if not exists settled boolean default false,
  add column if not exists settlement jsonb;
create index if not exists orders_status_idx on orders (status);
create index if not exists orders_vendor_idx on orders (vendor_phone);
create index if not exists orders_driver_idx on orders (driver_phone);
create index if not exists orders_offer_idx  on orders (offer_to);

-- 4) couriers: explicit online flag (a parked courier sends no movement updates)
alter table driver_locations add column if not exists online boolean default true;

-- 5) KYC: show the applicant's name in the admin queue
alter table kyc_requests add column if not exists user_name text;

-- 6) RLS (same dev stance as the other tables) -------------------------------------------------
alter table stores enable row level security;
drop policy if exists "anon-all" on stores;
create policy "anon-all" on stores for all using (true) with check (true);

-- 7) settings (never overwrite what the admin already changed)
insert into settings (k, v) values
  ('banner',        '{"title":"Your favorite store has no delivery?","cta":"Order it from here"}'::jsonb),
  ('customer_secs', '60'::jsonb),
  ('ride_enabled',  'true'::jsonb),
  ('ride_min_fare', '20'::jsonb),
  ('ride_base',     '25'::jsonb),
  ('ride_per_km',   '10'::jsonb)
on conflict (k) do nothing;

-- 8) wallet helpers + settlement (atomic, runs inside Postgres) --------------------------------
create or replace function _wallet_move(p_phone text, p_delta numeric, p_kind wallet_kind, p_order uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_phone is null or p_delta = 0 then return; end if;
  update profiles set wallet_balance = round(coalesce(wallet_balance, 0) + p_delta, 2) where phone = p_phone;
  insert into wallet_tx (user_phone, amount, kind, order_id, reason, created_by)
  values (p_phone, p_delta, p_kind, p_order, p_reason, 'system');
end $$;

-- Pays everyone out once the customer confirms. Idempotent.
--  wallet orders: customer is debited (price + fee + service fee); vendor/courier credited net of commission.
--  cash orders  : customer paid the courier in cash; the platform takes its commission from the wallets.
--  rides        : courier commission only (the agreed fare is never increased).
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
  if o.kind <> 'ride' then
    v_comm := round(prc * v_pct / 100, 2);
    if o.pay_via = 'wallet' then c_fee := round(fee * c_pct / 100, 2); end if;
  end if;
  c_total := prc + fee + c_fee;

  if o.pay_via = 'wallet' then
    perform _wallet_move(o.customer_phone, -c_total, 'payment', o.id, 'Payment');
    if o.vendor_phone is not null and prc > 0 then
      perform _wallet_move(o.vendor_phone, prc - v_comm, 'sale', o.id, 'Sale (net of commission)');
    end if;
    if o.driver_phone is not null then
      perform _wallet_move(o.driver_phone, fee - d_comm, 'delivery', o.id, 'Trip / delivery (net of commission)');
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

create or replace function adjust_wallet(p_phone text, p_delta numeric, p_reason text, p_by text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform _wallet_move(p_phone, p_delta, 'admin_adjust', null, coalesce(p_reason, 'admin adjustment'));
  insert into audit_log (action, detail, target, by_phone)
  values ('WALLET_ADJUST', p_delta::text || ' PHP — ' || coalesce(p_reason, ''), p_phone, p_by);
  return jsonb_build_object('ok', true);
end $$;

grant execute on function settle_order(uuid) to anon, authenticated;
grant execute on function adjust_wallet(text, numeric, text, text) to anon, authenticated;

-- 9) realtime for orders (the app also polls every 4 s, so this only makes it snappier)
do $$ begin alter publication supabase_realtime add table orders; exception when others then null; end $$;

-- Verify (run separately):
--   select column_name from information_schema.columns where table_name='orders' and column_name in ('kind','offer_to','pay_via');
--   select proname from pg_proc where proname in ('settle_order','adjust_wallet');
-- TIGHTEN BEFORE LAUNCH: these functions and tables are callable with the public anon key.
