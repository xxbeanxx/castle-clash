-- Phase 8 step 2: match history. Both tables are select-only for
-- `authenticated`/`anon` — every row is written exclusively by
-- `record_match_result()` (a later migration), a `security definer`
-- function granted to `service_role` only, so there is no insert policy
-- here at all, not even a restrictive one: nothing but the service role
-- (the authoritative server) is ever allowed to write match history.
create table public.matches (
  id uuid primary key,
  arena_ids text[] not null,
  mode text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  winner_id uuid references public.profiles (id),
  server_version text not null
);

create table public.match_participants (
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  placement integer not null,
  rounds_won integer not null default 0,
  eliminations integer not null default 0,
  deaths integer not null default 0,
  damage_dealt numeric not null default 0,
  powerups text[] not null default '{}',
  primary key (match_id, player_id)
);

alter table public.matches enable row level security;
alter table public.match_participants enable row level security;

create policy "authenticated users can view match history"
  on public.matches for select
  to authenticated
  using (true);

create policy "authenticated users can view match participants"
  on public.match_participants for select
  to authenticated
  using (true);
