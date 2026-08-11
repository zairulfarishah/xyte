-- Xyte — a multi-day site can carry a different crew on each day.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- One row per (member, day). assignment_date IS NULL means "this person is on
-- every day of the site" — which is exactly what every existing row means, so
-- old data keeps working untouched.
alter table site_assignments add column if not exists assignment_date date;

-- Drop duplicate (site, member, day) rows before the unique index goes on,
-- keeping the oldest row of each group.
delete from site_assignments a
using site_assignments b
where a.ctid > b.ctid
  and a.site_id   = b.site_id
  and a.member_id = b.member_id
  and coalesce(a.assignment_date, date '1900-01-01') = coalesce(b.assignment_date, date '1900-01-01');

-- The same person must not be added twice to the same day.
create unique index if not exists site_assignments_site_member_day_uniq
  on site_assignments (site_id, member_id, coalesce(assignment_date, date '1900-01-01'));

-- Calendar / dashboard read assignments by date.
create index if not exists site_assignments_date_idx
  on site_assignments (assignment_date);

comment on column site_assignments.assignment_date is
  'Day this assignment applies to. NULL = applies to every day of the site.';
