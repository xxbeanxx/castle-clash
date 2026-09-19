-- Phase 8 step 2: the one write path for match history/stats. Runs as
-- `security definer` so it can write `matches`/`match_participants`/
-- `player_stats` despite none of those tables granting `authenticated`/
-- `anon` any insert/update policy — but `execute` itself is revoked from
-- everyone except `service_role`, so only the authoritative server (using
-- the secret key) can ever call it. A single function call is one implicit
-- transaction already, so every insert/upsert below either all lands or
-- none does.
--
-- Payload shape (validated by shape, not a formal JSON schema — `apps/
-- server`'s caller is this function's only caller and is trusted to match
-- it exactly; a malformed payload fails loudly via NULL constraint
-- violations rather than being silently accepted):
-- {
--   "matchId": uuid, "arenaIds": text[], "mode": text,
--   "startedAt": timestamptz, "endedAt": timestamptz,
--   "winnerId": uuid | null, "serverVersion": text,
--   "participants": [{
--     "playerId": uuid, "placement": int, "roundsWon": int,
--     "eliminations": int, "deaths": int, "damageDealt": numeric,
--     "powerups": text[]
--   }, ...]
-- }
create function public.record_match_result(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid := (payload ->> 'matchId')::uuid;
  v_participant jsonb;
begin
  -- Idempotent: `MatchRoom` generates `matchId` once at room creation and
  -- may retry this call after a transient failure (plan step 5's
  -- retry-with-backoff) — a second call for the same match is a no-op, not
  -- a double-count, so an at-least-once retry queue can't corrupt stats.
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
    insert into public.match_participants (
      match_id, player_id, placement, rounds_won, eliminations, deaths, damage_dealt, powerups
    ) values (
      v_match_id,
      (v_participant ->> 'playerId')::uuid,
      (v_participant ->> 'placement')::integer,
      (v_participant ->> 'roundsWon')::integer,
      (v_participant ->> 'eliminations')::integer,
      (v_participant ->> 'deaths')::integer,
      (v_participant ->> 'damageDealt')::numeric,
      array(select jsonb_array_elements_text(v_participant -> 'powerups'))
    );

    insert into public.player_stats (
      player_id, matches_played, wins, eliminations, deaths, rounds_won, updated_at
    ) values (
      (v_participant ->> 'playerId')::uuid,
      1,
      case when (v_participant ->> 'placement')::integer = 1 then 1 else 0 end,
      (v_participant ->> 'eliminations')::integer,
      (v_participant ->> 'deaths')::integer,
      (v_participant ->> 'roundsWon')::integer,
      now()
    )
    on conflict (player_id) do update set
      matches_played = public.player_stats.matches_played + excluded.matches_played,
      wins = public.player_stats.wins + excluded.wins,
      eliminations = public.player_stats.eliminations + excluded.eliminations,
      deaths = public.player_stats.deaths + excluded.deaths,
      rounds_won = public.player_stats.rounds_won + excluded.rounds_won,
      updated_at = excluded.updated_at;
  end loop;
end;
$$;

-- Supabase's bootstrap `alter default privileges` grants `execute` on new
-- functions to `anon`/`authenticated` directly (not via `public`), so
-- revoking only from `public` leaves both roles able to call this — revoke
-- from all three explicitly.
revoke execute on function public.record_match_result(jsonb) from public, anon, authenticated;
grant execute on function public.record_match_result(jsonb) to service_role;
