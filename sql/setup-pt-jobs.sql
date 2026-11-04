-- ============================================================
-- Xyte — PT Mapper: jobs saved in Xyte so the whole team can open them
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run. Any team member can list, open, save and delete jobs.
-- ============================================================

-- ── 1. One row per PT Mapper job ────────────────────────────
-- The job itself (grid, levels, readings, areas, drawings) is the same JSON as
-- "Save job file" and lives in the pt-jobs bucket at file_path. The row holds
-- what the project list shows, so listing never downloads the files.
create table if not exists pt_jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- project name, e.g. "Menara ABC Level 3-5"
  file_path text not null,            -- "<id>.json" in the pt-jobs bucket
  levels int not null default 1,
  readings int not null default 0,    -- panel readings across all levels
  size_bytes int,
  created_by uuid references team_members(id) on delete set null,
  updated_by uuid references team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pt_jobs_updated_idx on pt_jobs (updated_at desc);

-- ── 2. Team members only ────────────────────────────────────
-- Same rule as setup-security.sql
alter table public.pt_jobs enable row level security;
drop policy if exists "team members only" on public.pt_jobs;
do $$
begin
  if exists (select 1 from pg_proc where proname = 'is_team_member' and pronamespace = 'public'::regnamespace) then
    create policy "team members only" on public.pt_jobs for all to authenticated
      using (public.is_team_member()) with check (public.is_team_member());
  else
    create policy "team members only" on public.pt_jobs for all to authenticated
      using (true) with check (true);
  end if;
end $$;

-- ── 3. Private bucket for the job files ─────────────────────
-- Read and write are covered by the storage rule in setup-security.sql;
-- without it, allow signed-in users on this bucket.
insert into storage.buckets (id, name, public)
values ('pt-jobs', 'pt-jobs', false)
on conflict (id) do nothing;

drop policy if exists "pt-jobs all" on storage.objects;
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'is_team_member' and pronamespace = 'public'::regnamespace) then
    create policy "pt-jobs all" on storage.objects for all to authenticated
      using (bucket_id = 'pt-jobs') with check (bucket_id = 'pt-jobs');
  end if;
end $$;
