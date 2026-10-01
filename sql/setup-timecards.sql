-- ============================================================
-- Xyte — Schedule module setup (daily timecards + OT)
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run.
-- ============================================================

-- One row per member per day. Members key in time in / time out; the app
-- works out normal and OT minutes (src/utils/timecard.js) and stores them
-- here so summaries don't need to recalculate.
create table if not exists timecards (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references team_members(id) on delete cascade,
  work_date date not null,
  -- Time slots for the day, each with its own site:
  -- [{"time_in":"08:00","time_out":"17:30","site_id":"<uuid>"}, {"time_in":"22:00","time_out":"04:00","site_id":""}]
  -- A time_out earlier than its time_in means that slot finished after midnight.
  segments jsonb not null default '[]'::jsonb,
  -- Quick summary of the day: first time in, last time out, first site.
  time_in time,
  time_out time,
  site_id uuid references sites(id) on delete set null,
  remarks text,
  worked_minutes int not null default 0,
  normal_minutes int not null default 0,
  ot_minutes int not null default 0,
  updated_by uuid references team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timecards_member_day_key unique (member_id, work_date)
);

create index if not exists timecards_work_date_idx on timecards (work_date desc);
create index if not exists timecards_site_id_idx   on timecards (site_id);

-- Permissive, matching the other Xyte tables. Tighten later if needed.
alter table timecards enable row level security;

do $$
declare
  a text;
begin
  foreach a in array array['select','insert','update','delete'] loop
    execute format('drop policy if exists %I on timecards', 'timecards ' || a);
    if a = 'insert' then
      execute format('create policy %I on timecards for insert with check (true)', 'timecards ' || a);
    else
      execute format('create policy %I on timecards for %s using (true)', 'timecards ' || a, a);
    end if;
  end loop;
end $$;
