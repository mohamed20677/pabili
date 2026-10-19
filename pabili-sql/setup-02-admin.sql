-- Pabili PH — Admin setup + seed (run AFTER schema.
-- Project: mmhneaixcyvmciyioxeo.supabase.co

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

-- Demo KYC queue so the admin panel has something to show
insert into kyc_requests (user_phone, role, status, data, ts)
select phone, role, 'pending',
       jsonb_build_object(
         'name', name,
         'submittedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS')
       ),
       now() - interval '12 hours'
from profiles
where verified = false and role = 'vendor'
on conflict do nothing;

insert into audit_log (action, detail, by_phone, ts)
values ('SYSTEM_INIT', 'Pabili PH schema installed', 'system', now());

-- Seed a banner broadcast so alerts tab works in tests
insert into broadcast_alerts (text, target, sent_by, ts)
values ('Welcome to Pabili PH! Try the negotiation flow.', 'all', 'admin', now());

-- Verify counts (run separately) ─────────────────────────────────────────────
-- select count(*) from profiles;
-- select count(*) from kyc_requests where status='pending';
-- select * from settings;
