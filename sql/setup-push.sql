-- ============================================================
-- Xyte — Push notifications: one row per subscribed device/browser
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run.
-- ============================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references team_members(id) on delete cascade,
  endpoint text not null unique,          -- push service URL for this device
  p256dh text not null,                   -- device public key
  auth text not null,                     -- device auth secret
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_member_idx on push_subscriptions (member_id);

alter table push_subscriptions enable row level security;

-- Permissive, matching the other Xyte tables. Tighten later if needed.
do $$
declare
  a text;
begin
  foreach a in array array['select','insert','update','delete'] loop
    execute format('drop policy if exists %I on push_subscriptions', 'push_subscriptions ' || a);
    if a = 'insert' then
      execute format('create policy %I on push_subscriptions for insert with check (true)', 'push_subscriptions ' || a);
    else
      execute format('create policy %I on push_subscriptions for %s using (true)', 'push_subscriptions ' || a, a);
    end if;
  end loop;
end $$;
