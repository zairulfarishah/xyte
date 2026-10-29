-- ============================================================
-- Xyte — Library card expiry dates (CIDB, NTSP, ANSP, OGSP…)
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run.
-- ============================================================

-- Date the card stops being valid. The Library page shows a countdown,
-- turns amber 30 days before and red once the date has passed.
alter table library_documents add column if not exists expires_on date;
