-- Xyte — admin can hide a site from the Sites page, whatever its status.
-- Hidden sites stay in the database (Dashboard, Calendar, Reports, etc. are unaffected);
-- they just drop off the Sites list until the admin unhides them.
-- Run once. Safe to re-run.

alter table sites
  add column if not exists is_hidden boolean not null default false;
