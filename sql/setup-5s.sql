-- ============================================================
-- Xyte — 5S module: zones and weekly zone audits with photos
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run. Only the admin account can read or change 5S data.
-- ============================================================

-- ── 1. Zones ────────────────────────────────────────────────
-- pic_name is plain text: a PIC doesn't have to be a Xyte user.
create table if not exists fives_zones (
  id uuid primary key default gen_random_uuid(),
  code text not null,                 -- "1", "4a", "9b" …
  name text not null,                 -- "Zone 1", or a proper area name
  pic_name text,
  zone_type text,                     -- office, store, toilet … (see ZONE_TYPES in src/utils/fiveS.js)
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── 2. One audit per zone per date ──────────────────────────
-- answers:  {"sort_1":"yes","sort_2":"no","set_1":"na", …} — 20 items (4 per pillar), Yes / No / N-A
-- pass_pct: Yes ÷ (Yes + No) as 0–100, null when nothing was marked Yes or No
-- photos:   [{"path": "...", "name": "..."}] in the five-s bucket
create table if not exists fives_audits (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references fives_zones(id) on delete cascade,
  audit_date date not null default current_date,
  answers jsonb not null default '{}'::jsonb,
  pass_pct numeric(5,1),
  notes text,
  photos jsonb not null default '[]'::jsonb,
  auditor_names text,
  created_by uuid references team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zone_id, audit_date)
);
create index if not exists fives_audits_date_idx on fives_audits (audit_date desc);

-- ── 3. Starting zones and PICs (from 5S_Checklist_Audit.xlsx) ─
-- Only when the table is empty, so re-running never duplicates or overwrites edits.
insert into fives_zones (code, name, pic_name, sort_order)
select z.code, 'Zone ' || z.code, z.pic, z.ord
from (values
  ('1', 'Izni', 1), ('2', 'Joshua', 2), ('3', 'Heliker', 3), ('4a', 'Heliker', 4), ('4b', 'Nurakmal', 5),
  ('5', 'Alif', 6), ('6', 'Heliker', 7), ('7', 'Jinner', 8), ('8', 'Peter', 9), ('9a', 'Rizuan', 10),
  ('9b', 'Dollah', 11), ('10', 'Peter', 12), ('11', 'Heliker', 13), ('12', 'Kailash', 14)
) as z(code, pic, ord)
where not exists (select 1 from fives_zones);

-- ── 4. Admin only ───────────────────────────────────────────
-- Same account as src/utils/admin.js
do $$
declare t text;
begin
  foreach t in array array['fives_zones','fives_audits'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "team members only" on public.%I', t);
    execute format('drop policy if exists "admin only" on public.%I', t);
    execute format(
      'create policy "admin only" on public.%I for all to authenticated '
      'using (lower(auth.jwt() ->> ''email'') = ''zairul.f@xradar.asia'') '
      'with check (lower(auth.jwt() ->> ''email'') = ''zairul.f@xradar.asia'')', t);
  end loop;
end $$;

-- ── 5. Public bucket for zone photos ────────────────────────
-- Photos open by their public URL. Uploading/deleting is covered by the storage rule in
-- setup-security.sql; without it, allow signed-in users on this bucket.
insert into storage.buckets (id, name, public)
values ('five-s', 'five-s', true)
on conflict (id) do nothing;

drop policy if exists "five-s write"  on storage.objects;
drop policy if exists "five-s delete" on storage.objects;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'is_team_member' and pronamespace = 'public'::regnamespace) then
    create policy "five-s write"  on storage.objects for insert to authenticated with check (bucket_id = 'five-s');
    create policy "five-s delete" on storage.objects for delete to authenticated using (bucket_id = 'five-s');
  end if;
end $$;

-- Check: should list the 14 zones
select code, name, pic_name from fives_zones order by sort_order;
