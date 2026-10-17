-- =====================================================================
-- Pabili v2 - ADMIN ADD-ON (run AFTER schema.sql, once, in SQL Editor)
-- Adds the test admin account gate + admin RPCs used by src/Admin.js.
-- Test admin login in the app: phone 0562989152, code 1785.
-- =====================================================================

-- Every auth user must have a profiles row (new sign-ups, incl. anonymous)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone) values (new.id, new.phone)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles for users that already exist
insert into public.profiles (id, phone)
select u.id, u.phone from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- Admin login: the app calls this right after an anonymous sign-in.
-- SECURITY DEFINER so it can set role='admin'; the code check is the gate.
create or replace function public.admin_login(p_phone text, p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_phone <> '0562989152' or p_code <> '1785' then
    raise exception 'invalid admin credentials';
  end if;
  insert into public.profiles (id, role, phone)
  values (auth.uid(), 'admin', p_phone)
  on conflict (id) do update set role = 'admin', phone = excluded.phone;
end $$;
grant execute on function public.admin_login(text, text) to authenticated, anon;

-- Admin-only guard used by the dashboard RPCs
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Pending KYC queue for the admin dashboard
create or replace function public.admin_queue()
returns setof public.kyc_requests language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  return query select * from public.kyc_requests where status = 'pending' order by created_at;
end $$;

-- Approve / reject a KYC request and flip the verified flag
create or replace function public.admin_decide(p_user uuid, p_role text, p_ok boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  update public.kyc_requests
     set status = case when p_ok then 'approved' else 'rejected' end
   where user_id = p_user and role = p_role and status = 'pending';
  if p_ok and p_role = 'vendor' then
    update public.vendors set verified = true where owner_id = p_user;
  elsif p_ok and p_role = 'driver' then
    update public.drivers set verified = true where user_id = p_user;
  end if;
end $$;

-- Live orders list for the admin dashboard
create or replace function public.admin_orders()
returns setof public.orders language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  return query select * from public.orders order by created_at desc limit 50;
end $$;

grant execute on function public.is_admin() to authenticated, anon;
grant execute on function public.admin_queue() to authenticated;
grant execute on function public.admin_decide(uuid, text, boolean) to authenticated;
grant execute on function public.admin_orders() to authenticated;

-- The app reads profile/orders/kyc through RLS; make sure admins can read all
do $$
begin
  begin
    drop policy if exists "admin read profiles" on public.profiles;
    create policy "admin read profiles" on public.profiles for select to authenticated
    using (id = auth.uid() or is_admin());
  exception when others then raise notice 'profiles policy: %', sqlerrm; end;
end $$;

-- VERIFY: should return one row each
-- select proname from pg_proc where proname in ('admin_login','admin_queue','admin_decide','admin_orders','is_admin');
