-- Pabili PH — Schema (run in Supabase SQL Editor first, then admin-setup.sql).
-- Project: mmhneaixcyvmciyioxeo.supabase.co
create extension if not exists "pgcrypto";

do $$ begin create type user_role as enum ('customer','driver','vendor','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type order_status as enum (
  'draft','vendor_quote','vendor_talk','quote_review',
  'finding_driver','driver_offer','driver_talk','accepted',
  'ready_pickup','picked_up','delivered','completed','cancelled','disputed'
); exception when duplicate_object then null; end $$;
do $$ begin create type kyc_status as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type wallet_kind as enum ('topup','hold','release','refund','commission','admin_adjust'); exception when duplicate_object then null; end $$;

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
  customer_phone text references profiles(phone),
  vendor_phone text references profiles(phone),
  driver_phone text references profiles(phone),
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
  negotiation jsonb default '[]'::jsonb,
  paid_held boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists orders_customer_idx on orders (customer_phone, created_at desc);
create index if not exists orders_vendor_idx on orders (vendor_phone, created_at desc);
create index if not exists orders_driver_idx on orders (driver_phone, created_at desc);

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
  ('commissions', '{"customer_pct":3,"vendor_pct":8,"driver_pct":10}'::jsonb),
  ('offer_secs', '30'::jsonb),
  ('vendor_secs', '60'::jsonb),
  ('max_drivers', '3'::jsonb),
  ('categories', '["Sari-sari","Groceries","Pharmacy","Gas / LPG","Food","Parcel","Flowers","Hardware"]'::jsonb),
  ('banner',     '{"title":"Your favorite store has no delivery?","cta":"Order it from here"}'::jsonb)
on conflict (k) do nothing;

-- Minimal RLS for dev (TIGHTEN BEFORE LAUNCH)
alter table profiles enable row level security;
alter table kyc_requests enable row level security;
alter table orders enable row level security;
alter table wallet_tx enable row level security;
alter table audit_log enable row level security;
alter table broadcast_alerts enable row level security;
alter table settings enable row level security;
