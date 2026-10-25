-- Pabili PH — Admin setup + seed (V13). Run AFTER setup-01.
-- V13 fixes 23502 "null value in column id of relation profiles":
-- a drifted profiles table has id NOT NULL with NO default. On Supabase that
-- column is often the FK target of auth.users(id), so we NEVER invent a random
-- id for it — instead:
--   • no auth.users FK  → attach gen_random_uuid() default, seed directly.
--   • auth.users FK     → seed profile ids FROM auth.users (matched by phone
--                         digits); demo rows are skipped with a NOTICE, and a
--                         trigger creates a profile for every future signup.
-- Self-healing + safe to re-run: all guards idempotent, all seeds deduped.

-- ─────────────────────────────────────────────────────────────────────────────
-- [GUARD] Enums (so this file works even if run BEFORE setup-01).
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin create type user_role as enum ('customer','driver','vendor','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type kyc_status as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- [GUARD] Ensure tables + columns referenced below exist (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────
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

-- [GUARD 23502] profiles.id default — ONLY when there is no FK to auth.users.
-- (With the FK, ids must come from auth.users; a random default would orphan
-- the row from its auth user.)
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'profiles' and column_name = 'id'
               and table_schema = 'public' and column_default is null)
     and to_regnamespace('auth') is not null
     and not exists (
       select 1 from pg_constraint c
       join pg_class r on r.oid = c.conrelid and r.relnamespace = 'public'::regnamespace
       join pg_class f on f.oid = c.confrelid
       where r.relname = 'profiles' and c.contype = 'f'
         and f.relnamespace = (select oid from pg_namespace where nspname = 'auth') and f.relname = 'users')
  then
    alter table profiles alter column id set default gen_random_uuid();
  end if;
end $$;

-- Backfill from an older column name, if this database ever had one.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'profiles' and column_name = 'full_name') then
    update profiles set name = full_name
    where name is null and full_name is not null;
  end if;
end $$;

create table if not exists kyc_requests (
  id uuid primary key default gen_random_uuid(),
  user_phone text references profiles(phone) on delete cascade,
  role user_role,
  status kyc_status default 'pending',
  data jsonb,
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

-- RLS + dev policy for any table this file just ensured (matches setup-01).
do $$ declare t text; begin
  foreach t in array array['profiles','kyc_requests','audit_log','broadcast_alerts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "anon-all" on %I', t);
    execute format('create policy "anon-all" on %I for all using (true) with check (true)', t);
  end loop;
end $$;
-- TIGHTEN BEFORE LAUNCH: replace anon-all with role-scoped policies.

-- [GUARD 42P10] "on conflict (phone)" needs a unique index on profiles.phone.
-- Old databases may have the column without the constraint — dedupe, then
-- create the unique index (only when missing).
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

-- ─────────────────────────────────────────────────────────────────────────────
-- [TRIGGER] Auto-create a profile row for every new signup. Needed when
-- profiles.id references auth.users(id) (Supabase default) — without it, app
-- sign-ups create auth users with NO profile. Guarded: only when auth schema
-- exists; idempotent on re-run.
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    execute $fn$
      create or replace function public.pabili_handle_new_user()
      returns trigger language plpgsql security definer set search_path = public as $inner$
      begin
        insert into public.profiles (id, phone, name, role, verified)
        values (
          new.id,
          coalesce(nullif(new.phone, ''), 'pending-' || new.id::text),
          coalesce(new.raw_user_meta_data->>'name', 'Pabili user'),
          'customer', false
        )
        on conflict (id) do update
          set phone = coalesce(nullif(new.phone, ''), profiles.phone);
        return new;
      end $inner$;
    $fn$;
    drop trigger if exists on_auth_user_created on auth.users;
    execute 'create trigger on_auth_user_created after insert on auth.users
             for each row execute function public.pabili_handle_new_user()';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- [SEED] Idempotent demo data — adapts to the schema variant found.
--   FK-mode    : only the ADMIN profile is created, with the id TAKEN FROM
--                auth.users (matched by phone digits). Demo users are skipped
--                (they get profiles automatically when they sign up).
--   Plain-mode : seed admin + 6 demo users directly (id default exists).
-- Admin phones accepted: '63917111015' (dashboard seed) or any auth phone whose
-- digits end with '562989152' (the app admin number 0562989152).
-- ─────────────────────────────────────────────────────────────────────────────
do $$ declare v_fk_auth boolean; v_admin_exists boolean; begin
  -- to_regnamespace returns NULL when the auth schema does not exist (plain PG)
  if to_regnamespace('auth') is null then
    v_fk_auth := false;
  else
    select exists (
      select 1 from pg_constraint c
      join pg_class r on r.oid = c.conrelid and r.relnamespace = 'public'::regnamespace
      join pg_class f on f.oid = c.confrelid
      where r.relname = 'profiles' and c.contype = 'f'
        and f.relnamespace = (select oid from pg_namespace where nspname = 'auth') and f.relname = 'users'
    ) into v_fk_auth;
  end if;

  if v_fk_auth then
    -- promote an existing profile row (idempotent)
    update profiles set role = 'admin', verified = true
    where phone in ('63917111015')
       or regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') like '%562989152';

    -- create the admin profile with the id from auth.users (never invented)
    insert into profiles (id, phone, name, role, verified)
    select u.id, '63917111015', 'Pabili Admin', 'admin', true
    from auth.users u
    where regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') like '%562989152'
       or regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') = '63917111015'
    on conflict (phone) do nothing;

    select exists (
      select 1 from profiles
      where role = 'admin'
        and (phone = '63917111015'
             or regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') like '%562989152')
    ) into v_admin_exists;

    if not v_admin_exists then
      raise notice 'PABILI SETUP: admin profile NOT seeded yet — no auth.users row with phone 0562989152 / 63917111015.';
      raise notice 'PABILI SETUP: 1) Sign up in the app with 0562989152 (any code while SMS is not live).';
      raise notice 'PABILI SETUP: 2) Re-run THIS FILE — it will promote that signup to admin automatically.';
    else
      raise notice 'PABILI SETUP: admin profile OK (linked to auth.users).';
    end if;
    raise notice 'PABILI SETUP: demo users skipped — profiles.id is linked to auth.users; profiles are created automatically at signup (trigger installed).';
  else
    insert into profiles (phone, name, role, verified)
    values ('63917111015', 'Pabili Admin', 'admin', true)
    on conflict (phone) do update set role='admin', verified=true;

    insert into profiles (phone, name, role, verified)
    values
      ('63917111001', 'Ramon Cruz',   'customer', true),
      ('63917111002', 'Liza Mercado', 'customer', true),
      ('63917111003', 'Juan Dela Cruz','driver',  true),
      ('63917111004', 'Maria Santos', 'driver',   true),
      ('63917111005', 'Aling Nena Sari-sari', 'vendor', true),
      ('63917111006', 'Botika ni Jose', 'vendor', false)
    on conflict (phone) do nothing;
    raise notice 'PABILI SETUP: admin + 6 demo profiles seeded (plain mode).';
  end if;
end $$;

-- Demo KYC queue — guarded with not-exists (kyc_requests has no unique key).
insert into kyc_requests (user_phone, role, status, data, ts)
select p.phone, p.role, 'pending',
       jsonb_build_object(
         'name', p.name,
         'submittedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS')
       ),
       now() - interval '12 hours'
from profiles p
where p.verified = false and p.role = 'vendor'
  and not exists (
    select 1 from kyc_requests k
    where k.user_phone = p.phone and k.role = p.role and k.status = 'pending'
  );

-- System-init audit marker — once only.
insert into audit_log (action, detail, by_phone, ts)
select 'SYSTEM_INIT', 'Pabili PH schema installed', 'system', now()
where not exists (select 1 from audit_log where action = 'SYSTEM_INIT');

-- Welcome broadcast — once only.
insert into broadcast_alerts (text, target, sent_by, ts)
select 'Welcome to Pabili PH! Try the negotiation flow.', 'all', 'admin', now()
where not exists (
  select 1 from broadcast_alerts where text like 'Welcome to Pabili PH!%'
);

-- Verify counts (run separately) ─────────────────────────────────────────────
-- select phone, name, role, verified from profiles order by created_at;
-- select count(*) from kyc_requests where status='pending';
-- select count(*) from audit_log;
-- select * from settings;
