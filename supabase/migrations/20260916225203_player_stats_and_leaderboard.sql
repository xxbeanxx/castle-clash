-- Phase 8 step 2/3: aggregate per-player counters, plus a curated public
-- view over them (plan: "public read through a leaderboard view exposing
-- display_name and counters only").
create table public.player_stats (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  matches_played integer not null default 0,
  wins integer not null default 0,
  eliminations integer not null default 0,
  deaths integer not null default 0,
  rounds_won integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.player_stats enable row level security;
-- Deliberately no select/insert/update policy at all: RLS is enabled with
-- zero policies, so `anon`/`authenticated` get zero rows querying this
-- table directly (default-deny) — the only sanctioned read path is the
-- `leaderboard` view below, and the only write path is
-- `record_match_result()` (next migration), which runs as `security
-- definer` and so bypasses RLS entirely regardless.
comment on table public.player_stats is
  'No RLS policies on purpose (default-deny) — read via public.leaderboard, write via record_match_result().';

-- Views run with their OWNER's privileges against underlying tables unless
-- created `security_invoker = true` (this one deliberately is NOT, so it
-- keeps Postgres's pre-15 default: the migration-applying role, which can
-- read `player_stats`/`profiles` directly, is what's checked — not
-- whatever anon/authenticated caller queries the view). That's what lets a
-- role with zero direct grants on either table still read this curated
-- projection. The explicit column list (never `select *`) is what
-- `supabase/tests/rls.test.sql` pins down: no email or other `auth.users`
-- column ever reaches this view even if `profiles` grows one later.
create view public.leaderboard as
select
  p.display_name,
  s.matches_played,
  s.wins,
  s.eliminations,
  s.deaths,
  s.rounds_won
from public.player_stats s
join public.profiles p on p.id = s.player_id;

grant select on public.leaderboard to anon, authenticated;
