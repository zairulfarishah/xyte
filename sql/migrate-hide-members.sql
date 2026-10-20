-- Xyte — admin can hide a member who has left the team.
-- Hidden members stay in the database with all their timecards, claims, leave,
-- site assignments and documents; they just drop off team lists and pickers
-- until the admin shows them again (Settings → Members).
-- Run once. Safe to re-run.

alter table team_members
  add column if not exists is_hidden boolean not null default false;
