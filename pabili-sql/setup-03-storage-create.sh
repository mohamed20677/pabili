# Pabili PH — Manual Storage bucket creation
# (Supabase JS can't create buckets from anon key — do it from dashboard OR service_role)

# From the dashboard (Storage → New bucket):
1. pabili-kyc-store    — public read, authenticated write
2. pabili-kyc-license  — public read, authenticated write
3. pabili-kyc-selfie   — public read, authenticated write
4. pabili-orders       — public read, authenticated write

# After creating, run this SQL to add per-folder size limits:
# alter table storage.objects enable row level security;
# create policy "public-read" on storage.objects for select using (bucket_id in (
#   'pabili-kyc-store','pabili-kyc-license','pabili-kyc-selfie','pabili-orders'));
# create policy "auth-write" on storage.objects for insert with check (
#   bucket_id in ('pabili-kyc-store','pabili-kyc-license','pabili-kyc-selfie','pabili-orders'));

# OR via curl with service_role_key (NEVER commit this key; run locally):
# SUPABASE_URL=https://mmhneaixcyvmciyioxeo.supabase.co
# SERVICE_KEY=eyJ...  # local env variable
# for B in pabili-kyc-store pabili-kyc-license pabili-kyc-selfie pabili-orders; do
#   curl -X POST "$SUPABASE_URL/storage/v1/bucket" \
#     -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" \
#     -H "Content-Type: application/json" \
#     -d "{\"name\":\"$B\",\"public\":true}"
# done
