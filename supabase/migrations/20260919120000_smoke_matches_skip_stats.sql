-- Phase 10 deploy smoke: a `mode = 'smoke'` match is recorded (the `matches`
-- and `match_participants` rows are how the post-deploy check proves the whole
-- write path works) but never touches `player_stats`. `public.leaderboard`
-- reads only `player_stats`, so a smoke match cannot appear on a leaderboard,
-- and the throwaway anonymous user a smoke run signs in as never accrues
-- counters or unlock progress.
--
-- Expand/contract: this is a body-only `create or replace` of an existing
-- function with an unchanged signature and unchanged behaviour for every
-- non-smoke payload, so the previous server release keeps working against the
-- migrated schema (and a rollback of the server needs no rollback here).
create or replace function public.record_match_result(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid := (payload ->> 'matchId')::uuid;
  v_is_smoke boolean := (payload ->> 'mode') = 'smoke';
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

    if v_is_smoke then
      continue;
    end if;

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

revoke execute on function public.record_match_result(jsonb) from public, anon, authenticated;
grant execute on function public.record_match_result(jsonb) to service_role;
