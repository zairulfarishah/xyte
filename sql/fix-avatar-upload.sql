-- Fix: "Photo upload failed: new row violates row-level security policy"
--
-- Uploading a member photo (Settings → Members) adds a new file to the
-- team-avatars bucket. The bucket can be read but has no rule allowing a
-- signed-in user to add or replace files, so Supabase blocks the upload.
--
-- Run this in the Supabase SQL editor. Safe to re-run.
-- setup-security.sql replaces all storage rules later, so this is a stop-gap.

drop policy if exists "team avatars: signed-in upload" on storage.objects;
drop policy if exists "team avatars: signed-in replace" on storage.objects;

create policy "team avatars: signed-in upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'team-avatars');

create policy "team avatars: signed-in replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'team-avatars')
  with check (bucket_id = 'team-avatars');

-- Check: should list the two rules above
select policyname, cmd, roles from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'team avatars:%';
