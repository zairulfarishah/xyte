-- Xyte — fix the uniqueness rule on site_assignments for per-day crew.
-- Run once in the Supabase SQL editor, after migrate-per-day-assignments.sql. Safe to re-run.

-- The table has (at least) two old unique constraints predating work_date,
-- all variants of "one row per (site, member)" — they block the whole
-- point of per-day assignment: the same person assigned on multiple
-- different days of the same site. Names vary (default-generated
-- "..._key", hand-named "..._day_uniq"), so find and drop all of them
-- rather than guessing every name that might exist.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.site_assignments'::regclass and contype = 'u'
  loop
    execute format('alter table site_assignments drop constraint %I', r.conname);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in
    select ic.relname as indexname
    from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    join pg_class tc on tc.oid = i.indrelid
    join pg_namespace n on n.oid = tc.relnamespace
    where n.nspname = 'public'
      and tc.relname = 'site_assignments'
      and i.indisunique
      and not i.indisprimary
  loop
    execute format('drop index if exists %I', r.indexname);
  end loop;
end $$;

-- Replace them with a single "one row per (site, member, day)" rule,
-- treating a NULL work_date (shared-crew mode) as a single shared day so
-- the old one-assignment-per-site-per-member guarantee still holds there.
create unique index site_assignments_site_member_workdate_idx
  on site_assignments (site_id, member_id, coalesce(work_date, '1970-01-01'));
