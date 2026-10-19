-- Pabili PH — Storage buckets + policies (V10). This is REAL SQL now — paste it
-- into the Supabase SQL editor (same place as setup-01/02). The old setup-03
-- was a shell/markdown instructions file; pasting it into the SQL editor caused
-- "syntax error at or near #". Safe to re-run.

-- Create the 4 buckets (idempotent).
insert into storage.buckets (id, name, public)
values
  ('pabili-kyc-store',   'pabili-kyc-store',   true),
  ('pabili-kyc-license', 'pabili-kyc-license', true),
  ('pabili-kyc-selfie',  'pabili-kyc-selfie',  true),
  ('pabili-orders',      'pabili-orders',      true)
on conflict (id) do nothing;

-- Public read of uploaded proofs, authenticated upload only.
drop policy if exists "pabili-buckets-public-read" on storage.objects;
create policy "pabili-buckets-public-read" on storage.objects
for select using (
  bucket_id in ('pabili-kyc-store','pabili-kyc-license','pabili-kyc-selfie','pabili-orders')
);

drop policy if exists "pabili-buckets-auth-write" on storage.objects;
create policy "pabili-buckets-auth-write" on storage.objects
for insert to authenticated with check (
  bucket_id in ('pabili-kyc-store','pabili-kyc-license','pabili-kyc-selfie','pabili-orders')
);

-- Verify (run separately) ────────────────────────────────────────────────────
-- select id, public from storage.buckets order by id;  -- expect 4 rows, public = true
