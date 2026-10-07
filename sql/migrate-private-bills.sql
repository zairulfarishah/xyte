-- ============================================================
-- Xyte — Split bills are private to the people on them
-- A bill (and its shares) can only be seen by: the payer, whoever posted it,
-- and the people in the split. Everyone else — admin included — can't read it.
-- Paste into: Supabase SQL Editor → Run. Safe to re-run. Run after setup-makan.sql.
-- ============================================================

-- Who posted the bill (may differ from who paid)
alter table bills add column if not exists created_by uuid references team_members(id) on delete set null;

-- The team member row of whoever is signed in
create or replace function public.my_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.team_members
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

-- Payer or poster: can edit, delete and add people
create or replace function public.can_manage_bill(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bills
    where id = b and public.my_member_id() is not null
      and (payer_id = public.my_member_id() or created_by = public.my_member_id())
  )
$$;

-- Anyone on the bill. security definer so the bills and bill_shares rules can
-- look at each other without looping.
create or replace function public.can_see_bill(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_bill(b) or exists (
    select 1 from public.bill_shares where bill_id = b and member_id = public.my_member_id()
  )
$$;

revoke all on function public.my_member_id()       from public;
revoke all on function public.can_manage_bill(uuid) from public;
revoke all on function public.can_see_bill(uuid)    from public;
grant execute on function public.my_member_id()       to authenticated;
grant execute on function public.can_manage_bill(uuid) to authenticated;
grant execute on function public.can_see_bill(uuid)    to authenticated;

-- Replace the old "whole team" rules
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public' and tablename in ('bills', 'bill_shares') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table bills       enable row level security;
alter table bill_shares enable row level security;

-- bills: checked on the row's own columns first, so a just-posted bill is
-- readable straight back by the person who posted it
create policy "bill: people on it" on bills for select to authenticated
  using (payer_id = public.my_member_id() or created_by = public.my_member_id()
         or exists (select 1 from bill_shares s where s.bill_id = bills.id and s.member_id = public.my_member_id()));
create policy "bill: post your own" on bills for insert to authenticated
  with check (created_by = public.my_member_id());
create policy "bill: payer or poster edits" on bills for update to authenticated
  using (payer_id = public.my_member_id() or created_by = public.my_member_id());
create policy "bill: payer or poster deletes" on bills for delete to authenticated
  using (payer_id = public.my_member_id() or created_by = public.my_member_id());

-- bill_shares: everyone on the bill sees all its shares (who owes what)
create policy "share: people on the bill" on bill_shares for select to authenticated
  using (member_id = public.my_member_id() or public.can_see_bill(bill_id));
create policy "share: payer or poster adds" on bill_shares for insert to authenticated
  with check (public.can_manage_bill(bill_id));
-- the person marks paid; the payer/poster confirms received
create policy "share: person or payer updates" on bill_shares for update to authenticated
  using (member_id = public.my_member_id() or public.can_manage_bill(bill_id));
create policy "share: payer or poster deletes" on bill_shares for delete to authenticated
  using (public.can_manage_bill(bill_id));
