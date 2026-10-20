-- Xyte — highlight colour on a timecard day (e.g. mark outstation days).
-- Picked from the colour dot before the date on the Timecard; the Excel / PDF
-- export fills that day's row with the same colour.
-- Run once. Safe to re-run.

alter table timecards
  add column if not exists highlight text;
