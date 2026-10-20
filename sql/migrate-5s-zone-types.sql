-- Xyte — 5S zone types (Office, Store, Toilet, Walkway …).
-- A zone's type pre-marks the checklist questions that don't apply to it as N-A
-- on new audits, and lets the Trend tab compare zones of the same type.
-- Run once. Safe to re-run.

alter table fives_zones
  add column if not exists zone_type text;
