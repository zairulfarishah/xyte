-- ============================================================
-- Xyte — Feed module setup (team announcements / bulletin posts)
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run.
-- ============================================================

-- ── 1. Posts ────────────────────────────────────────────────
create table if not exists feed_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references team_members(id) on delete set null,
  author_name text not null,
  body text not null default '',
  -- Uploaded files in the feed-media bucket:
  -- [{"path":"<member>/<ts>-photo.jpg","name":"photo.jpg","type":"image/jpeg","size":12345}]
  attachments jsonb not null default '[]'::jsonb,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── 2. Comments ─────────────────────────────────────────────
create table if not exists feed_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references feed_posts(id) on delete cascade,
  author_id uuid references team_members(id) on delete set null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- ── 3. Indexes ──────────────────────────────────────────────
create index if not exists feed_posts_order_idx    on feed_posts (pinned desc, created_at desc);
create index if not exists feed_comments_post_idx  on feed_comments (post_id, created_at);

-- ── 4. Row level security ───────────────────────────────────
alter table feed_posts    enable row level security;
alter table feed_comments enable row level security;

-- Permissive, matching the other Xyte tables. Tighten later if needed.
do $$
declare
  t text;
  a text;
begin
  foreach t in array array['feed_posts','feed_comments'] loop
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

-- ── 5. Public bucket for post images and attachments ────────
insert into storage.buckets (id, name, public)
values ('feed-media', 'feed-media', true)
on conflict (id) do nothing;

drop policy if exists "feed media read"   on storage.objects;
drop policy if exists "feed media write"  on storage.objects;
drop policy if exists "feed media delete" on storage.objects;

create policy "feed media read"   on storage.objects for select using (bucket_id = 'feed-media');
create policy "feed media write"  on storage.objects for insert with check (bucket_id = 'feed-media');
create policy "feed media delete" on storage.objects for delete using (bucket_id = 'feed-media');
