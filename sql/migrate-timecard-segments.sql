-- ============================================================
-- Xyte — timecards: several time slots per day
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run.
-- ============================================================

-- A day can now hold several slots, each with its own site — two sites in one
-- day, or a day shift plus night work:
--   [{"time_in":"08:00","time_out":"12:00","site_id":"<uuid>"},
--    {"time_in":"14:30","time_out":"17:30","site_id":"<uuid>"}]
-- time_in / time_out / site_id stay as a quick summary of the day
-- (first time in, last time out, first site).
alter table timecards add column if not exists segments jsonb not null default '[]'::jsonb;

-- Carry existing single-slot rows over.
update timecards
set segments = jsonb_build_array(jsonb_build_object(
  'time_in',  coalesce(to_char(time_in,  'HH24:MI'), ''),
  'time_out', coalesce(to_char(time_out, 'HH24:MI'), ''),
  'site_id',  coalesce(site_id::text, '')
))
where segments = '[]'::jsonb
  and (time_in is not null or time_out is not null);
