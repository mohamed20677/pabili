-- Pabili PH — Schema (V9). Adds withdrawals, addresses, driver_locations, push_tokens.
create extension if not exists "pgcrypto";

do $$ begin create type user_role as enum ('customer','driver','vendor','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type order_status as enum (
  'draft','vendor_quote','vendor_talk','quote_review',
  'finding_driver','driver_offer','driver_talk','accepted',
  'ready_pickup','picked_up','delivered','completed','cancelled','disputed'
); exception when duplicate_object then null; end $$;
do $$ begin create type kyc_status as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type wallet_kind as enum ('topup','hold','release','refund','commission','admin_adjust','withdrawal_hold','withdrawal_refund','sale','delivery','payment'); exception when duplicate_object then null; end $$;
do $$ begin create type withdrawal_status as enum ('pending','approved','rejected','paid','paid_stub'); exception when duplicate_object then null; end $$;
do $$ begin create type withdrawal_kind as enum ('ewallet','instapay','pesonet'); exception when duplicate_object then null; end $$;

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
create index if not exists kyc_pending_idx on kyc_requests (status, ts desc);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references orders(id) on delete cascade,  -- V9 cart: parent links sub-orders
  customer_phone text references profiles(phone),
  vendor_phone text references profiles(phone),
  driver_phone text references profiles(phone),
  store_id text,                       -- V9 references the store registry
  store_name text,                     -- denormalised for list rendering
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
create index if not exists orders_customer_idx on orders (customer_phone, created_at desc);
create index if not exists orders_parent_idx on orders (parent_id);

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
create index if not exists wallet_tx_user_idx on wallet_tx (user_phone, ts desc);

-- V9: addresses with explicit "default" flag.
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

-- V9: withdrawal ledger (full saga: pending → approved/rejected → paid_stub).
create table if not exists withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_phone text references profiles(phone) on delete cascade,
  amount numeric not null,
  fee numeric default 0,
  net numeric not null,
  provider text not null,        -- 'GCash' | 'Maya' | 'InstaPay' | 'PESONet'
  kind withdrawal_kind not null, -- 'ewallet' | 'instapay' | 'pesonet'
  account_label text,            -- mobile number or bank account
  status withdrawal_status default 'pending',
  reason text,                   -- populated when status=rejected
  history jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  paid_at timestamptz
);
create index if not exists withdrawals_user_idx on withdrawals (user_phone, created_at desc);
create index if not exists withdrawals_status_idx on withdrawals (status);

-- V9: live driver positions (single live row per driver).
create table if not exists driver_locations (
  driver_phone text primary key references profiles(phone) on delete cascade,
  lat numeric not null,
  lng numeric not null,
  accuracy numeric,
  source text default 'fg',               -- 'fg' foreground watchPosition, 'bg' Capacitor bg
  updated_at timestamptz default now()
);

-- V9: per-device push tokens.
create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_phone text references profiles(phone) on delete cascade,
  token text not null,
  kind text default 'expo',               -- 'expo' | 'webpush' | 'fcm'
  device_info text,
  created_at timestamptz default now()
);
create unique index if not exists push_tokens_unique on push_tokens (user_phone, token);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  detail text,
  target text,
  by_phone text,
  ts timestamptz default now()
);
create index if not exists audit_ts_idx on audit_log (ts desc);

create table if not exists broadcast_alerts (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  target text default 'all',
  sent_by text,
  ts timestamptz default now()
);

create table if not exists settings (
  k text primary key,
  v jsonb not null,
  updated_at timestamptz default now()
);
insert into settings (k, v) values
  ('commissions',  '{"customer_pct":3,"vendor_pct":8,"driver_pct":10}'::jsonb),
  ('offer_secs',   '30'::jsonb),
  ('vendor_secs',  '60'::jsonb),
  ('max_drivers',  '3'::jsonb),
  ('withdraw_min', '100'::jsonb),
  ('payouts',      '{\"GCash\":15,\"Maya\":15,\"InstaPay\":25,\"PESONet\":50}'::jsonb),
  ('categories',   '[\"Sari-sari\",\"Groceries\",\"Pharmacy\",\"Gas / LPG\",\"Food\",\"Parcel\",\"Flowers\",\"Hardware\"]'::jsonb)
on conflict (k) do nothing;

-- Minimal RLS for dev (TIGHTEN BEFORE LAUNCH)
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
