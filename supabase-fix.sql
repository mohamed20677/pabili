-- ============================================================
-- Pabili fix pack (run ONCE in Supabase SQL Editor -> Run)
-- Fixes: "core features do not work" + "registration data upload fails"
-- Root cause: every fresh install signs in as a NEW anonymous user,
-- but no row in public.profiles is created for it. All RPCs
-- (set_role, place_order, order_action) and the kyc_requests upsert
-- depend on that row, so they fail silently.
-- ============================================================

-- 1) Backfill: give every existing auth user a profiles row
insert into public.profiles (id, role)
select u.id, 'Customer' from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- 2) Trigger: every future auth user gets a profiles row automatically
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'Customer')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 3) Unique key that matches the app's upsert (user_id, role)
alter table public.kyc_requests drop constraint if exists kyc_requests_user_id_role_key;
alter table public.kyc_requests add constraint kyc_requests_user_id_role_key unique (user_id, role);

-- 4) Storage: kyc-documents bucket + upload/read policies (idempotent)
insert into storage.buckets (id, name, public)
values ('kyc-documents', 'kyc-documents', true)
on conflict (id) do nothing;

drop policy if exists "kyc upload own folder" on storage.objects;
create policy "kyc upload own folder" on storage.objects for insert to authenticated
with check (bucket_id = 'kyc-documents'
            and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "kyc read own or admin" on storage.objects;
create policy "kyc read own or admin" on storage.objects for select to authenticated
using (bucket_id = 'kyc-documents'
       and ((storage.foldername(name))[1] = auth.uid()::text
            or exists (select 1 from public.profiles p
                       where p.id = auth.uid() and p.is_admin)));

-- ============================================================
-- VERIFY (run each, expect results as noted)
-- ============================================================
-- A) every user has a profile:  must return 0 rows
--    select id from auth.users u where not exists
--      (select 1 from public.profiles p where p.id = u.id);
-- B) trigger exists:  must return on_auth_user_created
--    select tgname from pg_trigger where tgname = 'on_auth_user_created';
-- C) unique key:  must return one row
--    select conname from pg_constraint
--    where conrelid = 'public.kyc_requests'::regclass and conname like '%user_id%';
-- D) realtime still on:
--    select * from pg_publication_tables where pubname = 'supabase_realtime';
