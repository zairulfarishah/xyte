-- ============================================================
-- Xyte — Break Room games: high scores
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run. Run after sql/setup-makan.sql.
-- ============================================================

-- One row per finished game. Leaderboards take each member's best.
-- game: 'flappy' | '2048' | 'snake' | 'reaction' (reaction: score is ms, lower wins)
create table if not exists game_scores (
  id uuid primary key default gen_random_uuid(),
  game text not null,
  member_id uuid references team_members(id) on delete cascade,
  member_name text not null,
  score integer not null,
  created_at timestamptz not null default now()
);
create index if not exists game_scores_board_idx on game_scores (game, score desc);
create index if not exists game_scores_recent_idx on game_scores (game, created_at desc);

-- Same access rule as the rest of the database (see sql/setup-makan.sql)
do $$
declare
  team_rule boolean := exists (select 1 from pg_proc where proname = 'is_team_member' and pronamespace = 'public'::regnamespace);
  rule text := case when team_rule then 'public.is_team_member()' else 'true' end;
begin
  alter table public.game_scores enable row level security;
  drop policy if exists "team members only" on public.game_scores;
  drop policy if exists "signed in only" on public.game_scores;
  execute format(
    'create policy %I on public.game_scores for all to authenticated using (%s) with check (%s)',
    case when team_rule then 'team members only' else 'signed in only' end, rule, rule);
end $$;
