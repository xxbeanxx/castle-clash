-- pgTAP tests for `record_match_result()` (plan Phase 8 testing strategy):
-- counters increment correctly, and a second call with the same match ID
-- doesn't double-count.
begin;
select plan(7);

insert into auth.users (id, is_anonymous) values
  ('33333333-3333-3333-3333-333333333333', false),
  ('44444444-4444-4444-4444-444444444444', false);

set local role service_role;

select lives_ok(
  $$
  select public.record_match_result('{
    "matchId": "99999999-9999-9999-9999-999999999999",
    "arenaIds": ["pit"],
    "mode": "quick",
    "startedAt": "2026-09-16T00:00:00Z",
    "endedAt": "2026-09-16T00:05:00Z",
    "winnerId": "33333333-3333-3333-3333-333333333333",
    "serverVersion": "0.0.0",
    "participants": [
      {"playerId": "33333333-3333-3333-3333-333333333333", "placement": 1, "roundsWon": 2, "eliminations": 3, "deaths": 1, "damageDealt": 120.5, "powerups": ["lifesteal"]},
      {"playerId": "44444444-4444-4444-4444-444444444444", "placement": 2, "roundsWon": 0, "eliminations": 0, "deaths": 2, "damageDealt": 40, "powerups": []}
    ]
  }'::jsonb)
  $$,
  'record_match_result succeeds for a fresh match id'
);

select is(
  (select count(*)::int from public.matches where id = '99999999-9999-9999-9999-999999999999'),
  1,
  'exactly one matches row was inserted'
);

select is(
  (select count(*)::int from public.match_participants where match_id = '99999999-9999-9999-9999-999999999999'),
  2,
  'both participants rows were inserted'
);

select is(
  (select wins from public.player_stats where player_id = '33333333-3333-3333-3333-333333333333'),
  1,
  'the winner''s player_stats.wins is 1 after one recorded match'
);

select is(
  (select deaths from public.player_stats where player_id = '44444444-4444-4444-4444-444444444444'),
  2,
  'the loser''s player_stats.deaths reflects the recorded match'
);

-- Second call with the SAME match id: idempotent no-op, per the function's
-- own early-return on a `matches.id` conflict.
select lives_ok(
  $$
  select public.record_match_result('{
    "matchId": "99999999-9999-9999-9999-999999999999",
    "arenaIds": ["pit"],
    "mode": "quick",
    "startedAt": "2026-09-16T00:00:00Z",
    "endedAt": "2026-09-16T00:05:00Z",
    "winnerId": "33333333-3333-3333-3333-333333333333",
    "serverVersion": "0.0.0",
    "participants": [
      {"playerId": "33333333-3333-3333-3333-333333333333", "placement": 1, "roundsWon": 2, "eliminations": 3, "deaths": 1, "damageDealt": 120.5, "powerups": ["lifesteal"]},
      {"playerId": "44444444-4444-4444-4444-444444444444", "placement": 2, "roundsWon": 0, "eliminations": 0, "deaths": 2, "damageDealt": 40, "powerups": []}
    ]
  }'::jsonb)
  $$,
  'calling record_match_result again with the same matchId does not error'
);

select is(
  (select matches_played from public.player_stats where player_id = '33333333-3333-3333-3333-333333333333'),
  1,
  'a duplicate call with the same matchId does not double-count matches_played'
);

select * from finish();
rollback;
