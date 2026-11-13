-- ============================================================
-- Xyte — Layout: floor plans saved in Xyte so the whole team can open them
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run. Any team member can list, open, save and delete layouts.
-- ============================================================

-- ── 1. One row per layout ───────────────────────────────────
-- The plan itself (levels, walls, rooms, openings, drawing underlays) is JSON
-- in the layouts bucket at file_path. The row holds what the list shows,
-- so listing never downloads the files.
create table if not exists layout_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- e.g. "Menara ABC Level 3"
  file_path text not null,            -- "<id>.json" in the layouts bucket
  levels int not null default 1,
  area_m2 numeric not null default 0, -- room area across all levels
  size_bytes int,
  created_by uuid references team_members(id) on delete set null,
  updated_by uuid references team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists layout_plans_updated_idx on layout_plans (updated_at desc);

-- The site / project the layout belongs to (shown on the site's page)
alter table layout_plans add column if not exists site_id uuid references sites(id) on delete set null;
create index if not exists layout_plans_site_idx on layout_plans (site_id);

-- The bucket also holds, per layout:
--   photos/<layout id>/<uuid>.jpg      photos on site notes
--   revisions/<layout id>/<rev>.json   a copy of the layout at each issued revision

-- ── 2. Team members only ────────────────────────────────────
-- Same rule as setup-security.sql
alter table public.layout_plans enable row level security;
drop policy if exists "team members only" on public.layout_plans;
do $$
begin
  if exists (select 1 from pg_proc where proname = 'is_team_member' and pronamespace = 'public'::regnamespace) then
    create policy "team members only" on public.layout_plans for all to authenticated
      using (public.is_team_member()) with check (public.is_team_member());
  else
    create policy "team members only" on public.layout_plans for all to authenticated
      using (true) with check (true);
  end if;
end $$;

-- ── 3. Private bucket for the plan files ────────────────────
-- Read and write are covered by the storage rule in setup-security.sql;
-- without it, allow signed-in users on this bucket.
insert into storage.buckets (id, name, public)
values ('layouts', 'layouts', false)
on conflict (id) do nothing;

drop policy if exists "layouts all" on storage.objects;
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'is_team_member' and pronamespace = 'public'::regnamespace) then
    create policy "layouts all" on storage.objects for all to authenticated
      using (bucket_id = 'layouts') with check (bucket_id = 'layouts');
  end if;
end $$;
