-- Lock the database to signed-in team members.
--
-- Before this, every table and storage bucket allowed anyone holding the public
-- anon key (it ships inside the website) to read and write everything without
-- logging in. Sign-up is also open, so "signed in" alone is not enough: access
-- requires the signed-in email to belong to a row in team_members.
--
-- Run order:
--   1. Vercel → Settings → Environment Variables: add SUPABASE_SERVICE_ROLE_KEY
--      (Supabase → Project Settings → API → service_role). Redeploy.
--      The /api push + reminder functions need it; they bypass these rules.
--   2. Run this whole file in the Supabase SQL editor.
--   3. Log in to the app and check Sites, Team, Feed, Claims and a push notification.
--
-- Safe to re-run. Rollback is at the bottom.

-- ── 1. Who counts as a team member ──────────────────────────
-- security definer so the check can read team_members without tripping its own policy.
create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

revoke all on function public.is_team_member() from public;
grant execute on function public.is_team_member() to anon, authenticated;

-- ── 2. Tables: replace every policy with "team members only" ─
do $$
declare
  r record;
begin
  -- Old policies were all "using (true)" for everyone; drop them so none stays open.
  for r in select tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;

  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format(
      'create policy "team members only" on public.%I for all to authenticated '
      'using (public.is_team_member()) with check (public.is_team_member())',
      r.tablename
    );
  end loop;
end $$;

-- ── 3. Storage: same rule for every bucket ──────────────────
-- Public buckets (site photos, avatars) still serve images by their public URL;
-- this stops anonymous listing, uploading, overwriting and deleting.
do $$
declare
  r record;
begin
  for r in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy "team members only" on storage.objects for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());

-- ── Check ───────────────────────────────────────────────────
-- Every public table should show rowsecurity = true and one policy.
select t.tablename, t.rowsecurity, count(p.policyname) as policies
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
group by t.tablename, t.rowsecurity
order by t.tablename;

-- ── Rollback (only if something breaks — reopens everything) ─
-- do $$ declare r record; begin
--   for r in select tablename from pg_tables where schemaname = 'public' loop
--     execute format('create policy "temp open" on public.%I for all using (true) with check (true)', r.tablename);
--   end loop;
-- end $$;
-- create policy "temp open" on storage.objects for all using (true) with check (true);
