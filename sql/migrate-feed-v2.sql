-- ============================================================
-- Xyte — Feed v2: reactions, edit, site link, hide-after date
-- Run AFTER setup-feed.sql.
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run.
-- ============================================================

-- ── 1. New post columns ─────────────────────────────────────
alter table feed_posts add column if not exists site_id    uuid references sites(id) on delete set null;
alter table feed_posts add column if not exists expires_at timestamptz;   -- post hides itself after this
alter table feed_posts add column if not exists edited_at  timestamptz;   -- set when an admin edits it

create index if not exists feed_posts_site_idx on feed_posts (site_id, created_at desc);

-- ── 2. Reactions (one row per member per emoji per post) ────
create table if not exists feed_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references feed_posts(id) on delete cascade,
  member_id uuid not null references team_members(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint feed_reactions_unique unique (post_id, member_id, emoji)
);

create index if not exists feed_reactions_post_idx on feed_reactions (post_id);

-- ── 3. Row level security ───────────────────────────────────
alter table feed_reactions enable row level security;

-- Permissive, matching the other Xyte tables. Tighten later if needed.
do $$
declare
  a text;
begin
  foreach a in array array['select','insert','update','delete'] loop
    execute format('drop policy if exists %I on feed_reactions', 'feed_reactions ' || a);
    if a = 'insert' then
      execute format('create policy %I on feed_reactions for insert with check (true)', 'feed_reactions ' || a);
    else
      execute format('create policy %I on feed_reactions for %s using (true)', 'feed_reactions ' || a, a);
    end if;
  end loop;
end $$;
