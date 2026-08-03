-- ============================================================
-- Xyte — Claim module setup (mileage + general expense claims)
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run.
-- ============================================================

-- ── 1. Mileage claim header ─────────────────────────────────
create table if not exists mileage_claims (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references team_members(id) on delete set null,
  member_name text not null,
  vehicle_plate text,
  period text not null,                        -- e.g. "August 2026"
  rate_per_km numeric(6,2) not null default 0.50,
  total_km numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  status text not null default 'draft',
  submitted_by uuid references team_members(id) on delete set null,
  submitted_by_name text,
  submitted_at timestamptz,
  approved_by uuid references team_members(id) on delete set null,
  approved_by_name text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mileage_claims_status_check check (status in ('draft','submitted','approved','rejected'))
);

-- ── 2. Mileage journey rows ─────────────────────────────────
create table if not exists mileage_claim_rows (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references mileage_claims(id) on delete cascade,
  sort_order int not null default 0,
  row_date date not null default current_date,
  location text not null,                      -- readable route, e.g. "Office > KLCC > Office"
  description text,
  -- Stops of the route; every stop after the first carries the km travelled to reach it:
  -- [{"name":"Sonicon (Office)"},{"name":"KLCC","km":24},{"name":"Sonicon (Office)","km":24}]
  stops jsonb not null default '[]'::jsonb,
  km numeric(8,2) not null default 0,          -- Length of Journey = sum of all leg distances
  trips int not null default 1,
  amount numeric(10,2) not null default 0,     -- km x trips x rate_per_km
  created_at timestamptz not null default now()
);

-- ── 3. General expense claims (the "Other Claims" tab) ──────
create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references team_members(id) on delete set null,
  site_id uuid references sites(id) on delete set null,
  category text not null default 'other',
  claim_date date not null default current_date,
  amount numeric(10,2) not null default 0,
  description text,
  receipt_path text,
  status text not null default 'pending',
  reviewed_by uuid references team_members(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint claims_status_check check (status in ('pending','approved','rejected','paid'))
);

-- ── 4. Indexes ──────────────────────────────────────────────
create index if not exists mileage_claims_member_idx     on mileage_claims (member_id);
create index if not exists mileage_claim_rows_claim_idx  on mileage_claim_rows (claim_id, sort_order);
create index if not exists claims_member_id_idx          on claims (member_id);
create index if not exists claims_site_id_idx            on claims (site_id);
create index if not exists claims_claim_date_idx         on claims (claim_date desc);

-- ── 5. Row level security ───────────────────────────────────
alter table mileage_claims     enable row level security;
alter table mileage_claim_rows enable row level security;
alter table claims             enable row level security;

-- Permissive, matching the other Xyte tables. Tighten later if needed.
do $$
declare
  t text;
  a text;
begin
  foreach t in array array['mileage_claims','mileage_claim_rows','claims'] loop
    foreach a in array array['select','insert','update','delete'] loop
      execute format('drop policy if exists %I on %I', t || ' ' || a, t);
      if a = 'insert' then
        execute format('create policy %I on %I for insert with check (true)', t || ' ' || a, t);
      else
        execute format('create policy %I on %I for %s using (true)', t || ' ' || a, t, a);
      end if;
    end loop;
  end loop;
end $$;

-- ── 6. Private bucket for expense receipts ──────────────────
insert into storage.buckets (id, name, public)
values ('claim-receipts', 'claim-receipts', false)
on conflict (id) do nothing;

drop policy if exists "claim receipts read"   on storage.objects;
drop policy if exists "claim receipts write"  on storage.objects;
drop policy if exists "claim receipts delete" on storage.objects;

create policy "claim receipts read"   on storage.objects for select using (bucket_id = 'claim-receipts');
create policy "claim receipts write"  on storage.objects for insert with check (bucket_id = 'claim-receipts');
create policy "claim receipts delete" on storage.objects for delete using (bucket_id = 'claim-receipts');
