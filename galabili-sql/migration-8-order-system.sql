-- ============================================================================
-- GALABILI — MIGRATION 8: ORDER SYSTEM + INTERCITY + HOTELS (all-in-one)
-- Run this WHOLE file in the SQL editor of project mmhneaixcyvmciyioxeo
-- (the same project the app talks to). Idempotent: safe to re-run.
-- What it does:
--   [T1-T2] creates intercity_requests + intercity_offers (the trip feature)
--   [T3-T4] creates hotels + hotel_bookings (the hotel feature)
--   [T5]    ensures orders.offer_deadline exists (stage time limits)
--   [F]     installs the SERVER-SIDE order stage-machine guard (trigger):
--           the agreed sequence is enforced in the DATABASE, not only in the UI
--   [R]     dev-open RLS on the new tables (TIGHTEN BEFORE LAUNCH)
--   [P]     probes every table with a real write, then cleans up
--   [V]     prints the verification list — you must see 4x FOUND
-- NOTE: no foreign keys to profiles on purpose — the app links by phone +
-- uuid columns, so a missing profile row can never block these inserts.
-- ============================================================================

notify pgrst, 'reload schema';
create extension if not exists pgcrypto;

-- [T1] intercity_requests — the passenger's trip post
create table if not exists public.intercity_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  customer_phone text,
  customer_name text,
  from_city text not null,
  to_city text not null,
  travel_date date not null,
  passengers int default 1,
  note text,
  status text default 'open',
  booked_offer_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.intercity_requests add column if not exists customer_id uuid;
alter table public.intercity_requests add column if not exists booked_offer_id uuid;
alter table public.intercity_requests add column if not exists updated_at timestamptz default now();

-- [T2] intercity_offers — one driver's bid on a request
create table if not exists public.intercity_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid,
  driver_phone text,
  driver_name text,
  driver_id uuid,
  price numeric not null,
  message text,
  status text default 'sent',
  created_at timestamptz default now()
);
alter table public.intercity_offers add column if not exists driver_id uuid;
create index if not exists intercity_offers_req_idx on public.intercity_offers (request_id);

-- [T3] hotels — the admin-managed listings shown on the booking screen
create table if not exists public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  address text,
  room_type text default 'Standard',
  price_per_night numeric default 0,
  rooms_available int default 1,
  photo_url text,
  amenities text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.hotels add column if not exists updated_at timestamptz default now();

-- [T4] hotel_bookings — the tourist's booking request (pending → confirmed/rejected)
create table if not exists public.hotel_bookings (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid,
  guest_id uuid,
  guest_phone text,
  guest_name text,
  guest_type text default 'tourist',
  nationality text,
  check_in date not null,
  check_out date not null,
  guests int default 1,
  rooms int default 1,
  nights int default 1,
  total_price numeric default 0,
  contact text,
  note text,
  status text default 'pending',
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.hotel_bookings add column if not exists decided_by text;
alter table public.hotel_bookings add column if not exists decided_at timestamptz;
alter table public.hotel_bookings add column if not exists updated_at timestamptz default now();
create index if not exists hotel_bookings_guest_idx on public.hotel_bookings (guest_phone);

-- [T5] orders — stage deadline column used by the dispatch time limits
alter table public.orders add column if not exists offer_deadline timestamptz;

-- [F] SERVER-SIDE ORDER STAGE MACHINE (the agreed sequence, enforced in SQL):
--   sent to store → store-quote negotiation (±10%, deadline) → final price +
--   accept → driver stage (offer → negotiate → customer confirms) → driver
--   heads to pickup → pickup confirmed → delivered → customer confirms receipt.
--   Only the app-path writes carry negotiation.ui; direct/admin writes pass.
create or replace function public.galabili_order_guard() returns trigger as $fn$
declare
  old_ui text;
  new_ui text;
  allowed text[];
begin
  begin
    if new.negotiation is null then return new; end if; -- direct/admin write → pass
    old_ui := coalesce(old.negotiation->>'ui', old.status::text);
    new_ui := coalesce(new.negotiation->>'ui', new.status::text);
  exception when others then
    return new; -- malformed json → never block the write
  end;
  -- terminal outcomes are always accepted (cancel / complete / admin review)
  if new_ui in ('cancelled','completed','disputed') then return new; end if;
  if new_ui = old_ui then return new; end if;
  allowed := case old_ui
    when 'vendor_quote'   then array['quote_review','vendor_talk','cancelled']
    when 'quote_review'   then array['vendor_talk','finding_driver','ready_pickup','cancelled']
    when 'vendor_talk'    then array['quote_review','finding_driver','ready_pickup','cancelled']
    when 'finding_driver' then array['driver_offer','driver_talk','quote_review','cancelled']
    when 'driver_offer'   then array['driver_talk','finding_driver','accepted','cancelled']
    when 'driver_talk'    then array['driver_offer','quote_review','accepted','cancelled']
    when 'accepted'       then array['ready_pickup','cancelled']
    when 'ready_pickup'   then array['picked_up','cancelled']
    when 'picked_up'      then array['delivered','cancelled']
    when 'delivered'      then array['completed','disputed']
    else null end;
  if allowed is null then return new; end if; -- unknown legacy state → pass
  if not (new_ui = any(allowed)) then
    raise exception 'GALABILI-ORDER-FLOW: invalid stage transition % -> %', old_ui, new_ui;
  end if;
  return new;
end $fn$ language plpgsql;

drop trigger if exists galabili_order_guard_trg on public.orders;
create trigger galabili_order_guard_trg
  before update on public.orders
  for each row execute function public.galabili_order_guard();

-- [R] dev-open RLS on the new tables (TIGHTEN BEFORE LAUNCH — same stance as the rest)
do $rls$ declare t text; begin
  foreach t in array array['intercity_requests','intercity_offers','hotels','hotel_bookings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists anon_all on public.%I', t);
    execute format('create policy anon_all on public.%I for all using (true) with check (true)', t);
  end loop;
  raise notice 'R: anon_all ensured on the 4 new tables';
exception when others then
  raise notice 'R SKIP: %', sqlerrm;
end $rls$;

-- [P] probes — real writes through the app's columns, then cleanup
do $p1$ begin
  insert into public.intercity_requests (customer_phone, customer_name, from_city, to_city, travel_date, passengers, note)
  values ('9990001111','probe','Manila','Baguio', current_date + 1, 2, 'probe');
  raise notice 'PROBE intercity_requests insert: OK';
exception when others then
  raise notice 'PROBE intercity_requests FAILED: %', sqlerrm;
end $p1$;
delete from public.intercity_requests where customer_phone = '9990001111';

do $p2$ begin
  insert into public.intercity_offers (request_id, driver_phone, driver_name, price, message)
  select id, '9990002222','probe drv', 2500, 'probe offer' from public.intercity_requests limit 1;
  raise notice 'PROBE intercity_offers insert: OK';
exception when others then
  raise notice 'PROBE intercity_offers FAILED: %', sqlerrm;
end $p2$;
delete from public.intercity_offers where driver_phone = '9990002222';

do $p3$ begin
  insert into public.hotels (name, city, room_type, price_per_night, rooms_available)
  values ('probe hotel','Manila','Standard', 100, 1);
  raise notice 'PROBE hotels insert: OK';
exception when others then
  raise notice 'PROBE hotels FAILED: %', sqlerrm;
end $p3$;
delete from public.hotels where name = 'probe hotel';

do $p4$ begin
  insert into public.hotel_bookings (hotel_id, guest_phone, guest_name, check_in, check_out, guests, rooms, nights, total_price, contact)
  select id, '9990003333','probe guest', current_date + 1, current_date + 2, 1, 1, 1, 100, '0100' from public.hotels limit 1;
  raise notice 'PROBE hotel_bookings insert: OK';
exception when others then
  raise notice 'PROBE hotel_bookings FAILED: %', sqlerrm;
end $p4$;
delete from public.hotel_bookings where guest_phone = '9990003333';

-- [V] FINAL VERIFICATION — the output must show 4x FOUND + TRIGGER OK
do $v$ declare c int; begin
  select count(*) into c from information_schema.tables
   where table_schema='public' and table_name='intercity_requests';
  raise notice 'VERIFY intercity_requests: %', case when c=1 then 'FOUND' else 'MISSING' end;
  select count(*) into c from information_schema.tables
   where table_schema='public' and table_name='intercity_offers';
  raise notice 'VERIFY intercity_offers: %', case when c=1 then 'FOUND' else 'MISSING' end;
  select count(*) into c from information_schema.tables
   where table_schema='public' and table_name='hotels';
  raise notice 'VERIFY hotels: %', case when c=1 then 'FOUND' else 'MISSING' end;
  select count(*) into c from information_schema.tables
   where table_schema='public' and table_name='hotel_bookings';
  raise notice 'VERIFY hotel_bookings: %', case when c=1 then 'FOUND' else 'MISSING' end;
  select count(*) into c from information_schema.triggers
   where event_object_table='orders' and trigger_name='galabili_order_guard_trg';
  raise notice 'VERIFY order stage-machine trigger: %', case when c=1 then 'INSTALLED' else 'MISSING' end;
end $v$;

notify pgrst, 'reload schema';
