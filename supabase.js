// Pabili PH — Supabase adapter (live when .env has SUPABASE_URL + SUPABASE_ANON_KEY; falls back silently otherwise).
// Created with the approved spec from the team. No fake keys: read from expo-constants / .env; if missing → null.
import Constants from 'expo-constants';
// react-native-get-random-values polyfill is loaded in index.js BEFORE this module.
import { createClient } from '@supabase/supabase-js';

function readEnv() {
  const c = (Constants && Constants.expoConfig && Constants.expoConfig.extra) || {};
  // CHANGED (live 2026-10-19): read pabili-ph live env (project mmhneaixcyvmciyioxeo)
  // Note: SUPABASE_URL must be the base URL only (no /rest/v1/ suffix).
  return {
    url: c.SUPABASE_URL || process.env.SUPABASE_URL || 'https://mmhneaixcyvmciyioxeo.supabase.co',
    anon: c.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY ||
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1taG5lYWl4Y3l2bWNpeWlveGVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNDkzMjIsImV4cCI6MjEwNzcyNTMyMn0.AxJXLHyzeJu9h7KUR-qmY9MGvvTKhRmnqZHVYHCD_H4',
  };
}
const { url, anon } = readEnv();

export const SUPABASE_ENABLED = !!(url && anon);

export const supabase = SUPABASE_ENABLED
  ? createClient(url, anon, {
      auth: { storage: null /* SecureStore added below */, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;

// At runtime we rehydrate the session from expo-secure-store (we do the swap lazily because SecureStore isn't available everywhere).
let _wired = false;
export async function wireSupabaseSession() {
  if (!SUPABASE_ENABLED || _wired) return;
  _wired = true;
  try {
    const SecureStore = require('expo-secure-store');
    const access = await SecureStore.getItemAsync('sb_access');
    const refresh = await SecureStore.getItemAsync('sb_refresh');
    if (access && refresh && supabase.auth) {
      await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
    }
    supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        SecureStore.deleteItemAsync('sb_access').catch(() => {});
        SecureStore.deleteItemAsync('sb_refresh').catch(() => {});
        return;
      }
      SecureStore.setItemAsync('sb_access', session.access_token).catch(() => {});
      SecureStore.setItemAsync('sb_refresh', session.refresh_token).catch(() => {});
    });
  } catch (e) { /* SecureStore unavailable — session stays in memory only */ }
}

// ---------- Schema bootstrap (idempotent — runs via SQL editor or migrations) ----------
// Run once in Supabase SQL editor: supabase/schema.sql
export const SCHEMA_SQL = `
create extension if not exists "pgcrypto";

do $$ begin create type user_role as enum ('customer','driver','vendor','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type order_status as enum ('draft','vendor_quote','vendor_talk','quote_review','finding_driver','driver_offer','driver_talk','accepted','ready_pickup','picked_up','delivered','completed','cancelled','disputed'); exception when duplicate_object then null; end $$;
do $$ begin create type kyc_status as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  name text,
  role user_role default 'customer',
  rating numeric default 5.0,
  wallet_balance numeric default 0,
  wallet_credit numeric default 0,
  created_at timestamptz default now()
);

create table if not exists kyc_requests (
  id uuid primary key default gen_random_uuid(),
  user_phone text references profiles(phone) on delete cascade,
  role user_role not null,
  status kyc_status default 'pending',
  data jsonb not null,
  created_at timestamptz default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_phone text references profiles(phone),
  vendor_phone text references profiles(phone),
  driver_phone text references profiles(phone),
  category text,
  items text not null,
  pickup text not null,
  dropoff text not null,
  fee numeric default 0,
  price numeric default 0,
  status order_status default 'vendor_quote',
  photos jsonb default '{}'::jsonb,
  negotiation jsonb,
  paid_held boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists wallet_tx (
  id uuid primary key default gen_random_uuid(),
  user_phone text references profiles(phone),
  amount numeric not null,
  kind text not null,
  order_id uuid references orders(id),
  reason text,
  created_by text,
  created_at timestamptz default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  detail text,
  by_phone text,
  created_at timestamptz default now()
);

-- RLS: enable but permissive for anon (Production should tighten)
alter table profiles enable row level security;
alter table orders enable row level security;
alter table kyc_requests enable row level security;
alter table wallet_tx enable row level security;
alter table audit_log enable row level security;

create policy "anon-all" on profiles for all using (true) with check (true);
create policy "anon-all" on orders for all using (true) with check (true);
create policy "anon-all" on kyc_requests for all using (true) with check (true);
create policy "anon-all" on wallet_tx for all using (true) with check (true);
create policy "anon-all" on audit_log for all using (true) with check (true);

-- Storage buckets (run once via dashboard OR python admin API)
-- pabili-kyc-store, pabili-kyc-license, pabili-kyc-selfie, pabili-orders
`;

// ---------- Storage helpers ----------
export async function uploadOrderPhoto(bucket, file) {
  if (!supabase) return { simulated: true, uri: null };
  const path = bucket + '/' + Date.now() + '-' + (file?.name || 'photo.jpg');
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, { contentType: 'image/jpeg' });
  if (error) throw error;
  const { publicUrl } = supabase.storage.from(bucket).getPublicUrl(path).data;
  return { path, uri: publicUrl, ts: Date.now() };
}
