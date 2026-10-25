-- Pabili PH — V29: hotel-room booking for tourists and visitors.
-- Run this WHOLE file in the SQL editor of project mmhneaixcyvmciyioxeo
-- (same project the app talks to). Safe to re-run.
notify pgrst, 'reload schema';

-- [H1] hotels — the listing (managed from the Admin Hotels tab).
create table if not exists hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  address text,
  room_type text default 'Standard',     -- Standard | Double | Suite | Family
  price_per_night numeric not null default 0,
  rooms_available int default 1,
  photo_url text,
  amenities text,                        -- free text: wifi, breakfast, pool…
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- [H2] hotel_bookings — a tourist's reservation request.
create table if not exists hotel_bookings (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  guest_id uuid references profiles(id) on delete set null,
  guest_phone text,
  guest_name text,
  guest_type text default 'tourist',     -- tourist | visitor
  nationality text,
  check_in date not null,
  check_out date not null,
  guests int default 1,
  rooms int default 1,
  nights int default 1,
  total_price numeric default 0,
  contact text,                          -- phone / WhatsApp for coordination
  note text,
  status text default 'pending',         -- pending | confirmed | rejected | cancelled
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists hotel_bookings_hotel_idx on hotel_bookings (hotel_id);
create index if not exists hotel_bookings_guest_idx on hotel_bookings (guest_phone);

-- [R] dev-open RLS on both tables (TIGHTEN BEFORE LAUNCH — same stance as the rest).
do $r$ declare t text; begin
  foreach t in array array['hotels','hotel_bookings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists anon_all on public.%I', t);
    execute format('create policy anon_all on public.%I for all using (true) with check (true)', t);
  end loop;
  raise notice 'R: anon_all ensured on hotel tables';
exception when others then
  raise notice 'R SKIP: %', sqlerrm;
end $r$;

-- [S] seed 4 sample hotels so the booking screen is never empty (idempotent).
insert into hotels (name, city, address, room_type, price_per_night, rooms_available, amenities, active)
select 'Manila Bay View Hotel', 'Manila', 'Roxas Blvd, Malate', 'Standard', 2200, 8, 'wifi · breakfast · sea view', true
where not exists (select 1 from hotels where name = 'Manila Bay View Hotel');
insert into hotels (name, city, address, room_type, price_per_night, rooms_available, amenities, active)
select 'Baguio Pines Lodge', 'Baguio', 'Session Road', 'Double', 1800, 5, 'wifi · fireplace · parking', true
where not exists (select 1 from hotels where name = 'Baguio Pines Lodge');
insert into hotels (name, city, address, room_type, price_per_night, rooms_available, amenities, active)
select 'Cebu Seaside Suites', 'Cebu City', 'Mactan Island', 'Suite', 4500, 4, 'wifi · pool · breakfast · airport shuttle', true
where not exists (select 1 from hotels where name = 'Cebu Seaside Suites');
insert into hotels (name, city, address, room_type, price_per_night, rooms_available, amenities, active)
select 'Davao Garden Inn', 'Davao City', 'Matina', 'Family', 2600, 6, 'wifi · garden · family rooms', true
where not exists (select 1 from hotels where name = 'Davao Garden Inn');

-- [P] probe both tables with the app's real write path, then clean up.
do $p1$ begin
  insert into hotels (name, city, price_per_night) values ('probe hotel', 'Manila', 1000);
  raise notice 'PROBE hotels insert: OK';
exception when others then
  raise notice 'PROBE hotels FAILED: %', sqlerrm;
end $p1$;
delete from hotels where name = 'probe hotel';

do $p2$ begin
  insert into hotel_bookings (hotel_id, guest_phone, guest_name, check_in, check_out, guests, rooms, nights, total_price)
  select id, '9990001111','probe guest', current_date + 1, current_date + 3, 2, 1, 2, price_per_night * 2
  from hotels limit 1;
  raise notice 'PROBE hotel_bookings insert: OK';
exception when others then
  raise notice 'PROBE hotel_bookings FAILED: %', sqlerrm;
end $p2$;
delete from hotel_bookings where guest_phone = '9990001111';

notify pgrst, 'reload schema';
