-- Xyte — remove the unused assignment_date column.
--
-- Per-day crew shipped on work_date (see migrate-per-day-assignments.sql).
-- assignment_date came from a parallel attempt at the same feature and was
-- never written to. Run once in the Supabase SQL editor, after confirming the
-- guard below returns 0.

-- Guard: must be 0. Anything else means real data lives here — stop and
-- migrate it into work_date first.
select count(*) as rows_with_data
from site_assignments
where assignment_date is not null;

alter table site_assignments drop column if exists assignment_date;
