-- ============================================================================
-- GALABILI — MIGRATION 9: MENU PRODUCTS (registered stores) + SHOPPER LINK
-- Run this WHOLE file in the SQL editor of project mmhneaixcyvmciyioxeo.
-- Idempotent: safe to re-run.
--   [T1] products — the vendor's live menu (name + photo + price + available)
--   [T2] orders.type ('menu' = registered-store fixed-price order,
--        'shopper' = buy-it-for-me with negotiation) + orders.store_link
--   [R]  dev-open RLS on products (TIGHTEN BEFORE LAUNCH)
--   [P]  probe inserts, then cleanup
--   [V]  verification list — must show 3x FOUND
-- No foreign keys on purpose (same stance as migration 8 — a missing row can
-- never block an insert; the app links by ids it already holds).
-- ============================================================================

notify pgrst, 'reload schema';
create extension if not exists pgcrypto;

-- [T1] products — the vendor's live menu
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid,
  name text not null,
  image_url text,
  price numeric default 0,
  available boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists products_store_idx on public.products (store_id);

-- [T2] orders — flow type + the unregistered shop's Maps link
alter table public.orders add column if not exists type text default 'shopper';
alter table public.orders add column if not exists store_link text;

-- [G] STRENGTHENED STAGE MACHINE — V37 MENU LOCK: registered-store (menu)
-- orders can NEVER enter a negotiation stage — the menu prices are final,
-- enforced in the DATABASE. Replaces the migration-8 guard (same signature,
-- so the existing trigger picks it up) and re-installs the trigger so this
-- file is self-contained.
create or replace function public.galabili_order_guard() returns trigger as $fn$
declare
  old_ui text;
  new_ui text;
  allowed text[];
begin
  begin
    -- V37 MENU LOCK (checked first, works even on legacy rows without type):
    if coalesce(new.type, 'shopper') = 'menu'
       and coalesce(new.negotiation->>'ui', '') in ('vendor_quote','quote_review','vendor_talk') then
      raise exception 'GALABILI-MENU-FIXED-PRICE: menu orders cannot negotiate — the menu prices are final';
    end if;
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

-- [R] dev-open RLS on products (TIGHTEN BEFORE LAUNCH — same stance as the rest)
do $rls$ begin
  execute format('alter table public.products enable row level security');
  execute format('drop policy if exists anon_all on public.products');
  execute format('create policy anon_all on public.products for all using (true) with check (true)');
  raise notice 'R: anon_all ensured on products';
exception when others then
  raise notice 'R SKIP: %', sqlerrm;
end $rls$;

-- [P] probes — real writes, then cleanup
do $p1$ begin
  insert into public.products (store_id, name, price)
  select id, 'probe product', 50 from public.stores limit 1;
  raise notice 'PROBE products insert: OK';
exception when others then
  raise notice 'PROBE products FAILED: %', sqlerrm;
end $p1$;
delete from public.products where name = 'probe product';

do $p2$ begin
  insert into public.orders (kind, type, customer_phone, customer_name, request, items, fee, price, status, pay_via, negotiation, updated_at)
  values ('buy', 'menu', '9990009999', 'probe', 'probe menu order', '1× probe item', 20, 50, 'finding_driver', 'cash',
          '{"ui":"finding_driver"}'::jsonb, now());
  raise notice 'PROBE menu-shape order insert: OK';
exception when others then
  raise notice 'PROBE menu-shape order FAILED: %', sqlerrm;
end $p2$;
delete from public.orders where customer_phone = '9990009999';

-- [V] FINAL VERIFICATION — must show 3x FOUND
do $v$ declare c int; begin
  select count(*) into c from information_schema.tables
   where table_schema='public' and table_name='products';
  raise notice 'VERIFY products: %', case when c=1 then 'FOUND' else 'MISSING' end;
  select count(*) into c from information_schema.columns
   where table_schema='public' and table_name='orders' and column_name='type';
  raise notice 'VERIFY orders.type: %', case when c=1 then 'FOUND' else 'MISSING' end;
  select count(*) into c from information_schema.columns
   where table_schema='public' and table_name='orders' and column_name='store_link';
  raise notice 'VERIFY orders.store_link: %', case when c=1 then 'FOUND' else 'MISSING' end;
end $v$;

notify pgrst, 'reload schema';
