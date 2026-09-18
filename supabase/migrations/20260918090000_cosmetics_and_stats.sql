-- Phase 9 step 3: per-weapon win tracking for the `winWithWeapon` unlock
-- rule (`packages/shared/src/db/cosmetics.ts`'s `UnlockRule`), plus a
-- player's own read access to their `player_stats` row.
--
-- `match_participants.weapon` records which of the three base weapons
-- (`WEAPON_IDS`) that participant actually played the match with — nothing
-- in Phase 8's schema captured this at all. `player_stats.wins_by_weapon`
-- is the running tally `evaluateUnlocks()` reads `winsByWeapon` from; kept
-- as a single `jsonb` map (keyed by weapon id) rather than three separate
-- integer columns so a fourth weapon later doesn't need another migration
-- for a lightly-used feature.
alter table public.match_participants
  add column weapon text not null default 'sword' check (weapon in ('sword', 'mace', 'spear'));

alter table public.player_stats
  add column wins_by_weapon jsonb not null default '{}'::jsonb;

comment on column public.player_stats.wins_by_weapon is
  'Per-weapon win counts, e.g. {"sword": 3, "mace": 1} — feeds evaluateUnlocks()''s winWithWeapon rule.';

-- `player_stats` had zero select policies on purpose in Phase 8 (default-
-- deny; read via `public.leaderboard`) — but `leaderboard` only exposes
-- `display_name`, not `player_id`, so a signed-in player has no RLS-safe
-- way to identify *their own* row in it (a `display_name` collision, or a
-- guest's null `display_name`, both break that lookup). Phase 9's
-- `routes/stats.tsx` needs exactly that ("the player's counters"), so add
-- the narrow policy Phase 8 explicitly deferred: a player may select only
-- their own `player_stats` row. `public.leaderboard` is untouched and
-- still the only way to read anyone else's aggregate counters.
create policy "players can view their own stats"
  on public.player_stats for select
  to authenticated
  using (player_id = (select auth.uid()));

-- `record_match_result()` is replaced wholesale (its `create function`
-- can't be `alter`ed to add a parameter to the existing single-`jsonb`-
-- payload signature — the payload shape itself just grows a `weapon` key
-- per participant, so the function signature is unchanged, only its body).
-- Same idempotency/security-definer/revoke-then-grant shape as Phase 8's
-- original; see that migration's comments for why each of those pieces
-- exists.
create or replace function public.record_match_result(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid := (payload ->> 'matchId')::uuid;
  v_participant jsonb;
  v_weapon text;
  v_won boolean;
begin
  if exists (select 1 from public.matches where id = v_match_id) then
    return;
  end if;

  insert into public.matches (id, arena_ids, mode, started_at, ended_at, winner_id, server_version)
  values (
    v_match_id,
    array(select jsonb_array_elements_text(payload -> 'arenaIds')),
    payload ->> 'mode',
    (payload ->> 'startedAt')::timestamptz,
    (payload ->> 'endedAt')::timestamptz,
    nullif(payload ->> 'winnerId', '')::uuid,
    payload ->> 'serverVersion'
  );

  for v_participant in select jsonb_array_elements(payload -> 'participants')
  loop
    -- `coalesce(..., 'sword')` mirrors `player_loadouts.weapon`'s own
    -- default: a payload from a not-yet-updated caller (or a hand-run
    -- pgTAP fixture) that omits `weapon` entirely still inserts cleanly
    -- rather than erroring on a NOT NULL violation.
    v_weapon := coalesce(v_participant ->> 'weapon', 'sword');
    v_won := (v_participant ->> 'placement')::integer = 1;

    insert into public.match_participants (
      match_id, player_id, placement, rounds_won, eliminations, deaths, damage_dealt, powerups, weapon
    ) values (
      v_match_id,
      (v_participant ->> 'playerId')::uuid,
      (v_participant ->> 'placement')::integer,
      (v_participant ->> 'roundsWon')::integer,
      (v_participant ->> 'eliminations')::integer,
      (v_participant ->> 'deaths')::integer,
      (v_participant ->> 'damageDealt')::numeric,
      array(select jsonb_array_elements_text(v_participant -> 'powerups')),
      v_weapon
    );

    insert into public.player_stats (
      player_id, matches_played, wins, eliminations, deaths, rounds_won, wins_by_weapon, updated_at
    ) values (
      (v_participant ->> 'playerId')::uuid,
      1,
      case when v_won then 1 else 0 end,
      (v_participant ->> 'eliminations')::integer,
      (v_participant ->> 'deaths')::integer,
      (v_participant ->> 'roundsWon')::integer,
      case when v_won then jsonb_build_object(v_weapon, 1) else '{}'::jsonb end,
      now()
    )
    on conflict (player_id) do update set
      matches_played = public.player_stats.matches_played + excluded.matches_played,
      wins = public.player_stats.wins + excluded.wins,
      eliminations = public.player_stats.eliminations + excluded.eliminations,
      deaths = public.player_stats.deaths + excluded.deaths,
      rounds_won = public.player_stats.rounds_won + excluded.rounds_won,
      wins_by_weapon = case
        when v_won then jsonb_set(
          public.player_stats.wins_by_weapon,
          array[v_weapon],
          to_jsonb(coalesce((public.player_stats.wins_by_weapon ->> v_weapon)::integer, 0) + 1)
        )
        else public.player_stats.wins_by_weapon
      end,
      updated_at = excluded.updated_at;
  end loop;
end;
$$;

-- Same bootstrap-privilege gotcha as Phase 8's original function: `create
-- or replace` does NOT reset previously-granted privileges, but this
-- revoke/grant pair is idempotent and cheap to repeat regardless.
revoke execute on function public.record_match_result(jsonb) from public, anon, authenticated;
grant execute on function public.record_match_result(jsonb) to service_role;
