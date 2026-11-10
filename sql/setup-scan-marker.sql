-- ============================================================
-- Xyte — Scanning Point Marker: shared projects, live for the whole team
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run.
-- ============================================================

-- ── 1. One row per project (one drawing PDF) ────────────────
create table if not exists scan_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,                    -- e.g. "Menara ABC L3 drilling"
  pdf_path text not null,                -- "<id>.pdf" in the scan-drawings bucket
  pdf_name text not null,                -- original file name
  pdf_size int,
  settings jsonb not null default '{}',  -- prefix, target, marker size
  report jsonb not null default '{}',    -- project, location, scanned by, company, equipment, date
  created_by uuid references team_members(id) on delete set null,
  updated_by uuid references team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scan_projects_updated_idx on scan_projects (updated_at desc);

-- ── 2. One row per marked point ─────────────────────────────
create table if not exists scan_points (
  id text primary key,                   -- made by the app when the point is placed
  project_id uuid not null references scan_projects(id) on delete cascade,
  label text not null,                   -- point number, e.g. "P45"
  page int not null default 0,           -- 0 = first page of the drawing
  x double precision not null,           -- position on the sheet, in PDF points from top-left
  y double precision not null,
  status text not null default 'marked', -- marked / clear / shift / nogo
  note text not null default '',
  d jsonb not null default '{}',         -- top/bottom cover & spacing, thickness, conduit, PT
  created_by uuid references team_members(id) on delete set null,
  updated_by uuid references team_members(id) on delete set null,
  session_id text,                       -- which open screen made the last change (stops echoes)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scan_points_project_idx on scan_points (project_id);
-- No two points in a project can share a number (P45 and p45 count as the same)
create unique index if not exists scan_points_label_uq on scan_points (project_id, lower(label));

-- Deletes from other people arrive with the project id, so screens can match them
alter table scan_points replica identity full;

-- ── 3. Team members only (same rule as setup-security.sql) ──
do $$
declare t text;
begin
  foreach t in array array['scan_projects', 'scan_points'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "team members only" on public.%I', t);
    if exists (select 1 from pg_proc where proname = 'is_team_member' and pronamespace = 'public'::regnamespace) then
      execute format('create policy "team members only" on public.%I for all to authenticated using (public.is_team_member()) with check (public.is_team_member())', t);
    else
      execute format('create policy "team members only" on public.%I for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;

-- ── 4. Live updates ─────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['scan_points', 'scan_projects'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── 5. Private bucket for the drawing PDFs ──────────────────
-- Covered by the storage rule in setup-security.sql; without it, allow signed-in users on this bucket.
insert into storage.buckets (id, name, public)
values ('scan-drawings', 'scan-drawings', false)
on conflict (id) do nothing;

drop policy if exists "scan-drawings all" on storage.objects;
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'is_team_member' and pronamespace = 'public'::regnamespace) then
    create policy "scan-drawings all" on storage.objects for all to authenticated
      using (bucket_id = 'scan-drawings') with check (bucket_id = 'scan-drawings');
  end if;
end $$;
