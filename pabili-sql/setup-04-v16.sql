-- Pabili PH — V16 fixes (photo upload + editable profile). Paste into the Supabase SQL editor.
-- Safe to re-run. Run it AFTER setup-01 / setup-02 / setup-03.

-- 1) profile photo column
alter table profiles add column if not exists avatar_url text;

-- 2) buckets (adds the avatars bucket; forces public read for all five)
insert into storage.buckets (id, name, public) values
  ('pabili-avatars',     'pabili-avatars',     true),
  ('pabili-kyc-store',   'pabili-kyc-store',   true),
  ('pabili-kyc-license', 'pabili-kyc-license', true),
  ('pabili-kyc-selfie',  'pabili-kyc-selfie',  true),
  ('pabili-orders',      'pabili-orders',      true)
on conflict (id) do update set public = true;

-- 3) WHY uploads failed: the old policy only allowed role "authenticated", but the app signs in
-- with its own phone+code screen and never creates a Supabase auth session, so every upload
-- arrived as "anon" and was rejected. Allow anon + authenticated to insert (same dev stance as
-- the "anon-all" table policies).
drop policy if exists "pabili-buckets-public-read" on storage.objects;
drop policy if exists "pabili-buckets-auth-write"  on storage.objects;
drop policy if exists "pabili-buckets-read"        on storage.objects;
drop policy if exists "pabili-buckets-write"       on storage.objects;

create policy "pabili-buckets-read" on storage.objects for select
  using (bucket_id in ('pabili-avatars','pabili-kyc-store','pabili-kyc-license','pabili-kyc-selfie','pabili-orders'));

create policy "pabili-buckets-write" on storage.objects for insert to anon, authenticated
  with check (bucket_id in ('pabili-avatars','pabili-kyc-store','pabili-kyc-license','pabili-kyc-selfie','pabili-orders'));

-- TIGHTEN BEFORE LAUNCH: make the KYC buckets private (IDs / licences) and serve them with
-- signed URLs; replace anon write with real authenticated users.

-- Verify (run separately):
--   select id, public from storage.buckets order by id;           -- 5 rows, public = true
--   select policyname from pg_policies where tablename='objects'; -- pabili-buckets-read / -write
