-- Pabili PH — V28: intercity travel requests + driver offers.
-- Run this WHOLE file in the SQL editor of project mmhneaixcyvmciyioxeo
-- (same project the app talks to). Safe to re-run.
notify pgrst, 'reload schema';

-- [T1] intercity_requests — the passenger's trip post.
create table if not exists intercity_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references profiles(id) on delete cascade,
  customer_phone text,
  customer_name text,
  from_city text not null,
  to_city text not null,
  travel_date date not null,
  passengers int default 1,
  note text,
  status text default 'open',            -- open | booked | cancelled
  booked_offer_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- [T2] intercity_offers — one driver's bid on a request.
create table if not exists intercity_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references intercity_requests(id) on delete cascade,
  driver_phone text,
  driver_name text,
  driver_id uuid,
  price numeric not null,
  message text,
  status text default 'sent',            -- sent | accepted | declined
  created_at timestamptz default now()
);
create index if not exists intercity_offers_req_idx on intercity_offers (request_id);

-- [R] dev-open RLS on both tables (TIGHTEN BEFORE LAUNCH — same stance as the rest).
do $r$ declare t text; begin
  foreach t in array array['intercity_requests','intercity_offers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists anon_all on public.%I', t);
    execute format('create policy anon_all on public.%I for all using (true) with check (true)', t);
  end loop;
  raise notice 'R: anon_all ensured on intercity tables';
exception when others then
  raise notice 'R SKIP: %', sqlerrm;
end $r$;

-- [P] probe both tables with the app's real write path, then clean up.
do $p1$ begin
  insert into intercity_requests (customer_phone, customer_name, from_city, to_city, travel_date, passengers, note)
  values ('9990001111','probe','Manila','Baguio', current_date + 1, 2, 'probe');
  raise notice 'PROBE intercity_requests insert: OK';
exception when others then
  raise notice 'PROBE intercity_requests FAILED: %', sqlerrm;
end $p1$;
delete from intercity_requests where customer_phone = '9990001111';

do $p2$ begin
  insert into intercity_offers (request_id, driver_phone, driver_name, price, message)
  select id, '9990002222','probe drv', 2500, 'probe offer' from intercity_requests limit 1;
  raise notice 'PROBE intercity_offers insert: OK';
exception when others then
  raise notice 'PROBE intercity_offers FAILED: %', sqlerrm;
end $p2$;
delete from intercity_offers where driver_phone = '9990002222';

notify pgrst, 'reload schema';
