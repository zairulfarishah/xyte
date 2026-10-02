-- ============================================================
-- Xyte — Notification preferences + timecard reminder schedule
-- Run AFTER setup-push.sql.
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run.
-- ============================================================

-- ── 1. Category on each notification (assignment, feed_post, mention, …) ──
alter table notifications add column if not exists category text;

-- ── 2. Per-member switches: {"feed_post": false, "general": true, …} ──────
-- Missing keys fall back to the defaults in src/utils/notificationPrefs.js.
create table if not exists notification_prefs (
  member_id uuid primary key references team_members(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── 3. One row per reminder actually sent, so a reminder never goes out twice a day ──
create table if not exists reminder_log (
  kind text not null,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (kind, day)
);

-- ── 4. Row level security ───────────────────────────────────
alter table notification_prefs enable row level security;
alter table reminder_log       enable row level security;

-- Permissive, matching the other Xyte tables. Tighten later if needed.
do $$
declare
  t text;
  a text;
begin
  foreach t in array array['notification_prefs','reminder_log'] loop
    foreach a in array array['select','insert','update','delete'] loop
      execute format('drop policy if exists %I on %I', t || ' ' || a, t);
      if a = 'insert' then
        execute format('create policy %I on %I for insert with check (true)', t || ' ' || a, t);
      else
        execute format('create policy %I on %I for %s using (true)', t || ' ' || a, t, a);
      end if;
    end loop;
  end loop;
end $$;

-- ── 5. Timecard reminder schedule (times are UTC; Malaysia = UTC+8) ──────
--   Mon–Fri 5:30 PM MYT = 09:30 UTC      Sat 1:00 PM MYT = 05:00 UTC
-- The endpoint itself checks the Malaysia time, public holidays and leave,
-- and only reminds people who haven't keyed in a timecard for today.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'xyte-timecard-reminder-weekday',
  '30 9 * * 1-5',
  $$ select net.http_post(
       url     := 'https://xyte.vercel.app/api/reminders',
       body    := '{}'::jsonb,
       headers := '{"Content-Type": "application/json"}'::jsonb
     ) $$
);

select cron.schedule(
  'xyte-timecard-reminder-saturday',
  '0 5 * * 6',
  $$ select net.http_post(
       url     := 'https://xyte.vercel.app/api/reminders',
       body    := '{}'::jsonb,
       headers := '{"Content-Type": "application/json"}'::jsonb
     ) $$
);
