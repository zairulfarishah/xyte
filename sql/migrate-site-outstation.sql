-- Xyte — mark a site as outstation (outside KL / Selangor).
-- Set from the Add / Edit site form; outstation sites get a tinted card and
-- their days are highlighted on the Timecard (and its Excel / PDF export).
-- Run once. Safe to re-run.

alter table sites
  add column if not exists outstation boolean not null default false;
