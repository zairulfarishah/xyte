-- ============================================================
-- Xyte — Makan module: lunch spin + split bill
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run.
-- ============================================================

-- ── 1. Each member's payment details (DuitNow QR + bank text) ─
alter table team_members add column if not exists pay_qr_url  text;
alter table team_members add column if not exists pay_details text;

-- ── 2. Lunch spin ───────────────────────────────────────────
-- A round is one "where do we eat" decision; ideas are the places put forward.
create table if not exists lunch_rounds (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Lunch',
  created_by uuid references team_members(id) on delete set null,
  created_by_name text,
  status text not null default 'open' check (status in ('open', 'done')),
  winner_idea_id uuid,
  spun_by_name text,
  spun_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists lunch_ideas (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references lunch_rounds(id) on delete cascade,
  place text not null,
  note text,
  added_by uuid references team_members(id) on delete set null,
  added_by_name text,
  -- Everyone backing this place; each backer is one ticket in the spin
  backers uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists lunch_ideas_round_idx on lunch_ideas (round_id, created_at);
create index if not exists lunch_rounds_recent_idx on lunch_rounds (created_at desc);

-- ── 3. Split bill ───────────────────────────────────────────
create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  bill_date date not null default current_date,
  payer_id uuid references team_members(id) on delete set null,
  payer_name text not null,
  total numeric(10,2) not null default 0,
  -- Receipt photos in the makan bucket: [{"path": "...", "name": "..."}]
  receipts jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists bill_shares (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  member_id uuid references team_members(id) on delete set null,
  member_name text not null,
  amount numeric(10,2) not null default 0,
  item text,
  paid_at timestamptz,        -- the person says they've paid
  proof_path text,            -- optional transfer screenshot
  received_at timestamptz,    -- the payer confirms the money came in
  created_at timestamptz not null default now()
);
create index if not exists bill_shares_bill_idx   on bill_shares (bill_id);
create index if not exists bill_shares_member_idx on bill_shares (member_id);
create index if not exists bills_recent_idx       on bills (bill_date desc, created_at desc);


-- ── 4. Who can use it ───────────────────────────────────────
-- If sql/setup-security.sql has been run, use its "team members only" rule like
-- every other table. Otherwise fall back to any signed-in user.
do $$
declare
  t text;
  team_rule boolean := exists (select 1 from pg_proc where proname = 'is_team_member' and pronamespace = 'public'::regnamespace);
  rule text;
begin
  rule := case when team_rule then 'public.is_team_member()' else 'true' end;
  foreach t in array array['lunch_rounds','lunch_ideas','bills','bill_shares'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "team members only" on public.%I', t);
    execute format('drop policy if exists "signed in only" on public.%I', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (%s) with check (%s)',
      case when team_rule then 'team members only' else 'signed in only' end, t, rule, rule);
  end loop;
end $$;

-- ── 5. Live updates (spin result shows on everyone's screen) ─
do $$
declare t text;
begin
  foreach t in array array['lunch_rounds','lunch_ideas','bills','bill_shares'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── 6. Public bucket for QR codes, receipts and payment proof ─
-- Images open by their public URL. Uploads: setup-security.sql's storage rule
-- already covers every bucket; without it, allow signed-in users on this one.
insert into storage.buckets (id, name, public)
values ('makan', 'makan', true)
on conflict (id) do nothing;

drop policy if exists "makan read"   on storage.objects;
drop policy if exists "makan write"  on storage.objects;
drop policy if exists "makan delete" on storage.objects;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'is_team_member' and pronamespace = 'public'::regnamespace) then
    create policy "makan read"   on storage.objects for select using (bucket_id = 'makan');
    create policy "makan write"  on storage.objects for insert to authenticated with check (bucket_id = 'makan');
    create policy "makan delete" on storage.objects for delete to authenticated using (bucket_id = 'makan');
  end if;
end $$;
