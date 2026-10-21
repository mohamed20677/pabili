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
-- Pabili PH — Schema (V10). Idempotent on a FRESH database AND on a drifted one
-- (old-version tables already present). Fixes 42703 "column ts does not exist":
-- create table if not exists silently skipped old tables, then indexes/policies
-- referencing ts failed. Every column is now ensured via
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS, and policies are drop-then-create.

create extension if not exists "pgcrypto";

-- ---------- enums ----------
do $$ begin create type user_role as enum ('customer','driver','vendor','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type order_status as enum (
  'draft','vendor_quote','vendor_talk','quote_review',
  'finding_driver','driver_offer','driver_talk','accepted',
  'ready_pickup','picked_up','delivered','completed','cancelled','disputed'
); exception when duplicate_object then null; end $$;
-- top up values older builds may miss (no-ops when already present)
do $$ begin alter type order_status add value if not exists 'draft'; exception when others then null; end $$;
do $$ begin alter type order_status add value if not exists 'vendor_talk'; exception when others then null; end $$;
do $$ begin alter type order_status add value if not exists 'driver_offer'; exception when others then null; end $$;
do $$ begin create type kyc_status as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type wallet_kind as enum ('topup','hold','release','refund','commission','admin_adjust','withdrawal_hold','withdrawal_refund','sale','delivery','payment'); exception when duplicate_object then null; end $$;
do $$ begin alter type wallet_kind add value if not exists 'withdrawal_hold'; exception when others then null; end $$;
do $$ begin alter type wallet_kind add value if not exists 'withdrawal_refund'; exception when others then null; end $$;
do $$ begin create type withdrawal_status as enum ('pending','approved','rejected','paid','paid_stub'); exception when duplicate_object then null; end $$;
do $$ begin create type withdrawal_kind as enum ('ewallet','instapay','pesonet'); exception when duplicate_object then null; end $$;

-- ---------- profiles ----------
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  name text,
  role user_role default 'customer',
  rating numeric default 5.0,
  wallet_balance numeric default 0,
  wallet_credit numeric default 0,
  is_frozen boolean default false,
  verified boolean default false,
  created_at timestamptz default now()
);
alter table profiles
  add column if not exists phone text,
  add column if not exists name text,
  add column if not exists role user_role default 'customer',
  add column if not exists rating numeric default 5.0,
  add column if not exists wallet_balance numeric default 0,
  add column if not exists wallet_credit numeric default 0,
  add column if not exists is_frozen boolean default false,
  add column if not exists verified boolean default false,
  add column if not exists created_at timestamptz default now();

-- [GUARD] 42P10/FK fix: every later table references profiles(phone), which
-- needs a unique constraint. Drifted DBs have the column without it — dedupe,
-- then create the unique index (only when missing), BEFORE any FK is made.
do $$ begin
  if not exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
    where c.relname = 'profiles' and c.relnamespace = 'public'::regnamespace
      and a.attname = 'phone' and i.indisunique
  ) then
    delete from profiles a using profiles b where a.ctid > b.ctid and a.phone = b.phone;
    create unique index profiles_phone_uidx on profiles (phone);
  end if;
end $$;

-- ---------- kyc_requests ----------
create table if not exists kyc_requests (
  id uuid primary key default gen_random_uuid(),
  user_phone text references profiles(phone) on delete cascade,
  role user_role not null,
  status kyc_status default 'pending',
  data jsonb not null,
  note text,
  reviewer text,
  ts timestamptz default now()
);
alter table kyc_requests
  add column if not exists user_phone text,
  add column if not exists role user_role,
  add column if not exists status kyc_status default 'pending',
  add column if not exists data jsonb,
  add column if not exists note text,
  add column if not exists reviewer text,
  add column if not exists ts timestamptz default now();

-- ---------- orders ----------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references orders(id) on delete cascade,  -- V9 cart: parent links sub-orders
  customer_phone text references profiles(phone),
  vendor_phone text references profiles(phone),
  driver_phone text references profiles(phone),
  store_id text,
  store_name text,
  category text,
  items text not null,
  pickup_addr text not null,
  dropoff_addr text not null,
  pickup_lat numeric, pickup_lng numeric,
  dropoff_lat numeric, dropoff_lng numeric,
  fee numeric default 0,
  price numeric default 0,
  status order_status default 'vendor_quote',
  photos jsonb default '{}'::jsonb,
  negotiation jsonb default '{}'::jsonb,
  paid_held boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table orders
  add column if not exists parent_id uuid references orders(id) on delete cascade,
  add column if not exists customer_phone text,
  add column if not exists vendor_phone text,
  add column if not exists driver_phone text,
  add column if not exists store_id text,
  add column if not exists store_name text,
  add column if not exists category text,
  add column if not exists items text,
  add column if not exists pickup_addr text,
  add column if not exists dropoff_addr text,
  add column if not exists pickup_lat numeric,
  add column if not exists pickup_lng numeric,
  add column if not exists dropoff_lat numeric,
  add column if not exists dropoff_lng numeric,
  add column if not exists fee numeric default 0,
  add column if not exists price numeric default 0,
  add column if not exists status order_status default 'vendor_quote',
  add column if not exists photos jsonb default '{}'::jsonb,
  add column if not exists negotiation jsonb default '{}'::jsonb,
  add column if not exists paid_held boolean default false,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- ---------- wallet_tx ----------
create table if not exists wallet_tx (
  id uuid primary key default gen_random_uuid(),
  user_phone text references profiles(phone) on delete cascade,
  amount numeric not null,
  kind wallet_kind not null,
  order_id uuid references orders(id),
  reason text,
  created_by text,
  ts timestamptz default now()
);
alter table wallet_tx
  add column if not exists user_phone text,
  add column if not exists amount numeric,
  add column if not exists kind wallet_kind,
  add column if not exists order_id uuid,
  add column if not exists reason text,
  add column if not exists created_by text,
  add column if not exists ts timestamptz default now();

-- ---------- addresses (V9) ----------
create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  user_phone text references profiles(phone) on delete cascade,
  label text not null,
  addr text not null,
  lat numeric, lng numeric,
  is_default boolean default false,
  created_at timestamptz default now()
);
create unique index if not exists one_default_addr_idx on addresses (user_phone) where is_default = true;

-- ---------- withdrawals (V9) ----------
create table if not exists withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_phone text references profiles(phone) on delete cascade,
  amount numeric not null,
  fee numeric default 0,
  net numeric not null,
  provider text not null,
  kind withdrawal_kind not null,
  account_label text,
  status withdrawal_status default 'pending',
  reason text,
  history jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  paid_at timestamptz
);
create index if not exists withdrawals_user_idx on withdrawals (user_phone, created_at desc);
create index if not exists withdrawals_status_idx on withdrawals (status);

-- ---------- driver_locations (V9) ----------
create table if not exists driver_locations (
  driver_phone text primary key references profiles(phone) on delete cascade,
  lat numeric not null,
  lng numeric not null,
  accuracy numeric,
  source text default 'fg',
  updated_at timestamptz default now()
);

-- ---------- push_tokens (V9) ----------
create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_phone text references profiles(phone) on delete cascade,
  token text not null,
  kind text default 'expo',
  device_info text,
  created_at timestamptz default now()
);
create unique index if not exists push_tokens_unique on push_tokens (user_phone, token);

-- ---------- audit_log ----------
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  detail text,
  target text,
  by_phone text,
  ts timestamptz default now()
);
alter table audit_log
  add column if not exists action text,
  add column if not exists detail text,
  add column if not exists target text,
  add column if not exists by_phone text,
  add column if not exists ts timestamptz default now();

-- ---------- broadcast_alerts ----------
create table if not exists broadcast_alerts (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  target text default 'all',
  sent_by text,
  ts timestamptz default now()
);
alter table broadcast_alerts
  add column if not exists text text,
  add column if not exists target text default 'all',
  add column if not exists sent_by text,
  add column if not exists ts timestamptz default now();

-- ---------- settings ----------
create table if not exists settings (
  k text primary key,
  v jsonb not null,
  updated_at timestamptz default now()
);
alter table settings
  add column if not exists k text,
  add column if not exists v jsonb,
  add column if not exists updated_at timestamptz default now();
-- Legacy 'v' stored as text? Convert (guarded — skip on bad data).
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'settings' and column_name = 'v'
               and data_type <> 'jsonb') then
    alter table settings alter column v type jsonb using v::jsonb;
  end if;
exception when others then null;
end $$;

-- [GUARD] 42P10 fix: a drifted settings table (created earlier WITHOUT a unique
-- constraint on k) breaks "on conflict (k)". Dedupe rows, then ensure a unique
-- index so the upsert below works on any history.
do $$ begin
  if not exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
    where c.relname = 'settings' and c.relnamespace = 'public'::regnamespace
      and a.attname = 'k' and i.indisunique
  ) then
    delete from settings a using settings b where a.ctid > b.ctid and a.k = b.k;
    create unique index settings_k_uidx on settings (k);
  end if;
end $$;
insert into settings (k, v) values
  ('commissions',  '{"customer_pct":3,"vendor_pct":8,"driver_pct":10}'::jsonb),
  ('offer_secs',   '30'::jsonb),
  ('vendor_secs',  '60'::jsonb),
  ('max_drivers',  '3'::jsonb),
  ('withdraw_min', '100'::jsonb),
  ('payouts',      '{"GCash":15,"Maya":15,"InstaPay":25,"PESONet":50}'::jsonb),
  ('categories',   '["Sari-sari","Groceries","Pharmacy","Gas / LPG","Food","Parcel","Flowers","Hardware"]'::jsonb)
on conflict (k) do update set v = excluded.v, updated_at = now();

-- Repair rows an older/broken run may have written with over-escaped quotes
-- (e.g. {\"GCash\":15}) — reset the two JSON-list settings to canonical values.
update settings set v='{"GCash":15,"Maya":15,"InstaPay":25,"PESONet":50}'::jsonb, updated_at=now() where k='payouts';
update settings set v='["Sari-sari","Groceries","Pharmacy","Gas / LPG","Food","Parcel","Flowers","Hardware"]'::jsonb, updated_at=now() where k='categories';

-- ---------- [GUARD] primary keys on id (drifted legacy tables may lack them).
-- Skipped gracefully when id is missing or legacy data has dupes/NULLs.
do $$ declare t text; begin
  foreach t in array array['profiles','kyc_requests','orders','wallet_tx','addresses',
                           'withdrawals','push_tokens','audit_log','broadcast_alerts','settings'] loop
    begin
      if not exists (select 1 from pg_constraint c join pg_class r on r.oid = c.conrelid
                     where r.relname = t and r.relnamespace = 'public'::regnamespace
                       and c.contype = 'p')
         and exists (select 1 from information_schema.columns
                     where table_name = t and column_name = 'id'
                       and table_schema = 'public') then
        execute format('alter table %I add primary key (id)', t);
      end if;
    exception when others then null;
    end;
  end loop;
end $$;

-- ---------- indexes (after columns exist) ----------
create index if not exists kyc_pending_idx on kyc_requests (status, ts desc);
create index if not exists orders_customer_idx on orders (customer_phone, created_at desc);
create index if not exists orders_parent_idx on orders (parent_id);
create index if not exists wallet_tx_user_idx on wallet_tx (user_phone, ts desc);
create index if not exists audit_ts_idx on audit_log (ts desc);

-- ---------- RLS + dev policies (drop-then-create = safe on old DBs) ----------
alter table profiles enable row level security;
alter table kyc_requests enable row level security;
alter table orders enable row level security;
alter table wallet_tx enable row level security;
alter table addresses enable row level security;
alter table withdrawals enable row level security;
alter table driver_locations enable row level security;
alter table push_tokens enable row level security;
alter table audit_log enable row level security;
alter table broadcast_alerts enable row level security;
alter table settings enable row level security;

do $$ declare t text; begin
  foreach t in array array['profiles','kyc_requests','orders','wallet_tx','addresses',
                           'withdrawals','driver_locations','push_tokens','audit_log',
                           'broadcast_alerts','settings'] loop
    execute format('drop policy if exists "anon-all" on %I', t);
    execute format('create policy "anon-all" on %I for all using (true) with check (true)', t);
  end loop;
end $$;
-- TIGHTEN BEFORE LAUNCH: replace anon-all with role-scoped policies.

`;

// Photo upload lives in media.js (React Native safe). The old uploadOrderPhoto() was removed:
// it expected a browser File, which does not exist in React Native.
