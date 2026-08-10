-- Xyte — allow crew assignments to be scoped to a specific day of a multi-day site.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- NULL means "applies to every day of the site" (existing behavior, unchanged).
-- A date means "applies only to that day" — used when a site has different
-- crew per day.
alter table site_assignments add column if not exists work_date date;
