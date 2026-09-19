-- pgTAP tests for Phase 10's deploy-smoke exclusion: a `mode: "smoke"` match
-- is recorded (matches + match_participants rows, so the smoke can prove the
-- write path works) but never reaches `player_stats`, the only table
-- `public.leaderboard` reads — while a normal match still does.
begin;
select plan(6);

insert into auth.users (id, is_anonymous) values
  ('55555555-5555-5555-5555-555555555555', true);

set local role service_role;

select lives_ok(
  $$
  select public.record_match_result('{
    "matchId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "arenaIds": ["smoke"],
    "mode": "smoke",
    "startedAt": "2026-09-19T00:00:00Z",
    "endedAt": "2026-09-19T00:00:00Z",
    "winnerId": "55555555-5555-5555-5555-555555555555",
    "serverVersion": "1.0.0",
    "participants": [
      {"playerId": "55555555-5555-5555-5555-555555555555", "placement": 1, "roundsWon": 0, "eliminations": 0, "deaths": 0, "damageDealt": 0, "powerups": [], "weapon": "sword"}
    ]
  }'::jsonb)
  $$,
  'record_match_result accepts a smoke-mode match'
);

select is(
  (select mode from public.matches where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'smoke',
  'the smoke match is stored, flagged mode = smoke'
);

select is(
  (select count(*)::int from public.match_participants where match_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'the smoke match''s participant row is stored'
);

select is(
  (select count(*)::int from public.player_stats where player_id = '55555555-5555-5555-5555-555555555555'),
  0,
  'a smoke match creates no player_stats row, so it cannot reach the leaderboard'
);

select public.record_match_result('{
  "matchId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "arenaIds": ["pit"],
  "mode": "quick",
  "startedAt": "2026-09-19T00:00:00Z",
  "endedAt": "2026-09-19T00:05:00Z",
  "winnerId": "55555555-5555-5555-5555-555555555555",
  "serverVersion": "1.0.0",
  "participants": [
    {"playerId": "55555555-5555-5555-5555-555555555555", "placement": 1, "roundsWon": 2, "eliminations": 1, "deaths": 0, "damageDealt": 10, "powerups": [], "weapon": "sword"}
  ]
}'::jsonb);

select is(
  (select matches_played from public.player_stats where player_id = '55555555-5555-5555-5555-555555555555'),
  1,
  'a normal match by the same user still counts'
);

select is(
  (select count(*)::int from public.leaderboard where matches_played = 1),
  1,
  'the leaderboard reflects only the normal match'
);

select * from finish();
rollback;
