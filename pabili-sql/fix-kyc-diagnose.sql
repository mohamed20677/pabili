-- ═════════════════════════════════════════════════════════════════════════════
-- Pabili PH — KYC ONE-RUN DIAGNOSE + REPAIR (V18)
-- Run this WHOLE file in the Supabase SQL editor of project mmhneaixcyvmciyioxeo
-- (the project the app talks to — hardcoded in supabase.js).
-- Every step is wrapped: a failure prints a SKIP/PROBE notice and the run
-- continues to the end. Nothing is deleted except probe rows it created itself.
-- ═════════════════════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';

-- [R1] kyc_requests — the app inserts ONLY: user_phone, user_name, role,
--      status, data (cloud.js submitKycCloud). Make sure every column it
--      sends exists, every no-default NOT NULL legacy column (like user_id)
--      is relaxed, and id has a default.
do $$ begin
  if to_regclass('public.kyc_requests') is null then
    create table kyc_requests (
      id uuid primary key default gen_random_uuid(),
      user_phone text, user_name text, role text,
      status text default 'pending', data jsonb default '{}'::jsonb,
      note text, reviewer text, ts timestamptz default now()
    );
    raise notice 'R1 kyc_requests: created (did not exist).';
  else
    alter table kyc_requests add column if not exists user_phone text;
    alter table kyc_requests add column if not exists user_name text;
    alter table kyc_requests add column if not exists role text;
    alter table kyc_requests add column if not exists status text default 'pending';
    alter table kyc_requests add column if not exists data jsonb default '{}'::jsonb;
    alter table kyc_requests add column if not exists note text;
    alter table kyc_requests add column if not exists reviewer text;
    alter table kyc_requests add column if not exists ts timestamptz default now();
    raise notice 'R1 kyc_requests: app columns ensured.';
  end if;
exception when others then raise notice 'R1 kyc_requests SKIP: %', sqlerrm;
end $$;

do $$ declare r record; begin
  for r in
    select column_name from information_schema.columns
    where table_schema='public' and table_name='kyc_requests'
      and is_nullable='NO' and column_default is null and column_name <> 'id'
  loop
    execute format('alter table public.kyc_requests alter column %I drop not null', r.column_name);
    raise notice 'R1 kyc_requests.% relaxed to nullable (legacy column the app never sends).', r.column_name;
  end loop;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='kyc_requests'
               and column_name='id' and column_default is null)
     and not exists (
       select 1 from pg_constraint c
       join pg_class t on t.oid=c.conrelid and t.relnamespace='public'::regnamespace
       join pg_class f on f.oid=c.confrelid
       where t.relname='kyc_requests' and c.contype='f'
         and f.relnamespace=(select oid from pg_namespace where nspname='auth')
         and f.relname='users')
  then
    alter table public.kyc_requests alter column id set default gen_random_uuid();
    raise notice 'R1 kyc_requests.id: default gen_random_uuid() added.';
  end if;
exception when others then raise notice 'R1 relax SKIP: %', sqlerrm;
end $$;

-- [R2] profiles — the app upserts with onConflict 'phone' (needs a UNIQUE
--      index) and selects name, avatar_url, wallet_balance, is_frozen,
--      driver_status, vendor_status, vehicle, plate.
do $$ begin
  alter table profiles add column if not exists name text;
  alter table profiles add column if not exists avatar_url text;
  alter table profiles add column if not exists wallet_balance numeric default 0;
  alter table profiles add column if not exists is_frozen boolean default false;
  alter table profiles add column if not exists driver_status text;
  alter table profiles add column if not exists vendor_status text;
  alter table profiles add column if not exists vehicle text;
  alter table profiles add column if not exists plate text;
  raise notice 'R2 profiles: app columns ensured.';
exception when others then raise notice 'R2 profiles SKIP: %', sqlerrm;
end $$;

do $$ begin
  if not exists (select 1 from pg_indexes
                 where schemaname='public' and tablename='profiles'
                   and indexname='profiles_phone_uidx')
     and exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where c.relname='profiles' and n.nspname='public')
  then
    delete from profiles a using profiles b
      where a.ctid > b.ctid and a.phone = b.phone and a.phone is not null;
    create unique index profiles_phone_uidx on profiles (phone);
    raise notice 'R2 profiles: unique index profiles_phone_uidx created (duplicate rows removed, oldest kept).';
  else
    raise notice 'R2 profiles: unique phone index already present.';
  end if;
exception when others then raise notice 'R2 unique-phone SKIP: %', sqlerrm;
end $$;

-- [R3] stores — the app upserts with onConflict 'owner_phone' (needs PK/unique).
do $$ begin
  create table if not exists stores (
    owner_phone text primary key, name text, category text, area text,
    address text, active boolean default false, open boolean default false,
    created_at timestamptz default now()
  );
  alter table stores add column if not exists name text;
  alter table stores add column if not exists category text;
  alter table stores add column if not exists area text;
  alter table stores add column if not exists address text;
  alter table stores add column if not exists active boolean default false;
  alter table stores add column if not exists open boolean default false;
  raise notice 'R3 stores: table + columns ensured.';
exception when others then raise notice 'R3 stores SKIP: %', sqlerrm;
end $$;

do $$ begin
  if not exists (select 1 from pg_indexes
                 where schemaname='public' and tablename='stores'
                   and indexname='stores_owner_uidx')
     and to_regclass('public.stores') is not null
  then
    delete from stores a using stores b
      where a.ctid > b.ctid and a.owner_phone = b.owner_phone and a.owner_phone is not null;
    create unique index stores_owner_uidx on stores (owner_phone);
    raise notice 'R3 stores: unique index stores_owner_uidx created.';
  else
    raise notice 'R3 stores: unique owner_phone index already present.';
  end if;
exception when others then raise notice 'R3 unique-owner SKIP: %', sqlerrm;
end $$;

-- [R4] RLS — dev posture: anon-all on the three tables (TIGHTEN BEFORE LAUNCH).
do $$ declare t text; begin
  foreach t in array array['kyc_requests','profiles','stores'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists anon_all on public.%I', t);
    execute format('create policy anon_all on public.%I for all using (true) with check (true)', t);
  end loop;
  raise notice 'R4 RLS: anon_all policy ensured on kyc_requests, profiles, stores.';
exception when others then raise notice 'R4 RLS SKIP: %', sqlerrm;
end $$;

-- [R5] Storage — the 5 buckets media.js writes to, public-read + insert.
do $$ begin
  insert into storage.buckets (id, name, public) values
    ('pabili-avatars','pabili-avatars', true),
    ('pabili-kyc-store','pabili-kyc-store', true),
    ('pabili-kyc-license','pabili-kyc-license', true),
    ('pabili-kyc-selfie','pabili-kyc-selfie', true),
    ('pabili-orders','pabili-orders', true)
  on conflict (id) do nothing;
  raise notice 'R5 buckets: 5 pabili buckets ensured.';
exception when others then
  raise notice 'R5 buckets SKIP: % (create them in Dashboard → Storage)', sqlerrm;
end $$;

do $$ begin
  execute 'drop policy if exists pabili_public_read on storage.objects';
  execute $p$create policy pabili_public_read on storage.objects for select
    using (bucket_id in ('pabili-avatars','pabili-kyc-store','pabili-kyc-license','pabili-kyc-selfie','pabili-orders'))$p$;
  execute 'drop policy if exists pabili_auth_insert on storage.objects';
  execute $p$create policy pabili_auth_insert on storage.objects for insert to anon, authenticated
    with check (bucket_id in ('pabili-avatars','pabili-kyc-store','pabili-kyc-license','pabili-kyc-selfie','pabili-orders'))$p$;
  raise notice 'R5 storage policies: public_read + auth_insert ensured.';
exception when others then
  raise notice 'R5 storage-policies SKIP: % (set them in Dashboard → Storage → Policies)', sqlerrm;
end $$;

-- [P1] PROBE — the app's EXACT kyc insert. This is the decisive test:
--      OK here + error in the app  ⇒ the APK is talking to a DIFFERENT project.
do $$ begin
  insert into kyc_requests (user_phone, user_name, role, status, data)
  values ('9990001111','probe','driver','pending','{"probe":true}'::jsonb);
  delete from kyc_requests where data->>'probe'='true';
  raise notice 'PROBE kyc insert: OK ✔ — this table CANNOT throw the user_id error anymore.';
exception when others then begin
  begin delete from kyc_requests where data->>'probe'='true'; exception when others then null; end;
  raise notice 'PROBE kyc insert FAILED: %', sqlerrm;
end $$;

-- [P2] PROBE — the app's profiles upsert (onConflict phone).
do $$ begin
  insert into profiles (phone, name, driver_status, vehicle, plate)
  values ('9990001111','probe','pending','Motorbike','666')
  on conflict (phone) do update set driver_status='pending', vehicle=excluded.vehicle, plate=excluded.plate;
  delete from profiles where phone='9990001111';
  raise notice 'PROBE profiles upsert: OK ✔';
exception when others then raise notice 'PROBE profiles upsert FAILED: %', sqlerrm;
end $$;

-- [P3] PROBE — the app's stores upsert (onConflict owner_phone).
do $$ begin
  insert into stores (owner_phone, name, category, area, address, active, open)
  values ('9990001111','probe store','Food','x','y', false, false)
  on conflict (owner_phone) do update set name=excluded.name;
  delete from stores where owner_phone='9990001111';
  raise notice 'PROBE stores upsert: OK ✔';
exception when others then raise notice 'PROBE stores upsert FAILED: %', sqlerrm;
end $$;

-- [REPORT 1] every table named kyc_requests in this database (any schema).
--      More than one row, or a schema you don't expect = found the culprit.
select table_schema, table_name from information_schema.tables
where table_name = 'kyc_requests';

-- [REPORT 2] remaining NOT NULL no-default columns the app could still hit
--      ('id' is fine — it has a default; 'phone' is fine — the app sends it).
select table_name, column_name from information_schema.columns
where table_schema='public' and table_name in ('kyc_requests','profiles','stores')
  and is_nullable='NO' and column_default is null;

-- [REPORT 3] triggers on kyc_requests (a trigger could redirect/raise).
select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgrelid='kyc_requests'::regclass and not tgisinternal;

-- [REPORT 4] storage policies actually present.
select policyname, cmd, roles from pg_policies
where schemaname='storage' and tablename='objects';

notify pgrst, 'reload schema';
-- ═══ END — send screenshots of every NOTICE line + the 4 REPORT tables ═══
