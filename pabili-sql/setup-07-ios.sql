-- Pabili PH — V19 (iOS): in-app account deletion (Apple App Store guideline 5.1.1(v) requires it).
-- Run AFTER setup-06. Safe to re-run.

-- lets the app remove the user's own uploaded photos (same dev stance as the other storage policies)
drop policy if exists "pabili-buckets-delete" on storage.objects;
create policy "pabili-buckets-delete" on storage.objects for delete to anon, authenticated
  using (bucket_id in ('pabili-avatars','pabili-kyc-store','pabili-kyc-license','pabili-kyc-selfie','pabili-orders'));

-- Anonymises the person and removes their personal data. Order / wallet rows stay (accounting) but lose the name.
-- Refused while an order or ride is in progress or the wallet is not empty.
create or replace function delete_account(p_phone text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare bal numeric; busy int;
begin
  select coalesce(wallet_balance, 0) into bal from profiles where phone = p_phone;
  if not found then return jsonb_build_object('ok', false, 'error', 'Account not found.'); end if;
  select count(*) into busy from orders
   where status not in ('completed', 'cancelled')
     and (customer_phone = p_phone or vendor_phone = p_phone or driver_phone = p_phone or offer_to = p_phone);
  if busy > 0 then
    return jsonb_build_object('ok', false, 'error', 'You still have an order or ride in progress. Finish or cancel it first.');
  end if;
  if bal <> 0 then
    return jsonb_build_object('ok', false, 'error', 'Your wallet balance is not zero (PHP ' || bal || '). Contact support so we can settle it before deleting.');
  end if;
  delete from driver_locations where driver_phone = p_phone;
  delete from kyc_requests     where user_phone   = p_phone;
  delete from stores           where owner_phone  = p_phone;
  update orders set customer_name = 'Deleted user' where customer_phone = p_phone;
  update orders set driver_name = 'Deleted user', driver_vehicle = null where driver_phone = p_phone;
  update profiles set name = null, avatar_url = null, vehicle = null, plate = null,
                      driver_status = 'none', vendor_status = 'none' where phone = p_phone;
  insert into audit_log (action, detail, target, by_phone) values ('ACCOUNT_DELETED', 'user deleted own account', p_phone, p_phone);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function delete_account(text) to anon, authenticated;
