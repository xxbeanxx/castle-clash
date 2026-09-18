-- pgTAP RLS tests (plan Phase 8 testing strategy). Run via `pnpm exec
-- supabase test db` (docs/research/phase8-supabase-cli-podman.md §8 — pgTAP
-- ships in the image but needs `create extension`, done in
-- 20260916224803_extensions.sql).
--
-- `set_config('request.jwt.claims', ..., true)` + `set local role` is the
-- standard way to simulate "as user X" inside a single pgTAP transaction —
-- `auth.uid()` reads `request.jwt.claims->>'sub'` (confirmed by inspecting
-- the local instance's actual `auth.uid()` definition, not assumed).
begin;
select plan(11);

-- Two players, inserted directly into auth.users (RLS/triggers aren't
-- bypassed by this — the same `on_auth_user_created` trigger real sign-up
-- goes through fires here too, creating each profiles row for real).
insert into auth.users (id, is_anonymous) values
  ('11111111-1111-1111-1111-111111111111', false),
  ('22222222-2222-2222-2222-222222222222', false);

update public.profiles set display_name = 'alice' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set display_name = 'bob' where id = '22222222-2222-2222-2222-222222222222';

-- Seed A's loadout as the service role (bypasses RLS entirely — this is
-- setup, not the behavior under test).
insert into public.player_loadouts (player_id, weapon)
values ('11111111-1111-1111-1111-111111111111', 'mace');

-- --- Test 1-2: user A can't select or update B's loadout -------------------
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::int from public.player_loadouts where player_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'user B cannot select user A''s loadout row'
);

select lives_ok(
  $$ update public.player_loadouts set weapon = 'spear' where player_id = '11111111-1111-1111-1111-111111111111' $$,
  'user B''s update of user A''s loadout row does not error (RLS silently filters it to 0 rows instead)'
);

-- `throws_ok` above only proves it doesn't error; confirm the row is
-- actually unchanged, back as the service role so the read isn't itself
-- RLS-filtered.
reset role;
select is(
  (select weapon from public.player_loadouts where player_id = '11111111-1111-1111-1111-111111111111'),
  'mace',
  'user A''s loadout weapon is unchanged after user B''s attempted update'
);

-- --- Test 3: a loadout with a locked helmet_id is rejected ------------------
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select throws_ok(
  $$ update public.player_loadouts set helmet_id = 'crown_of_thorns' where player_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'equipping a helmet_id not present in player_unlocks is rejected by RLS'
);

reset role;
insert into public.player_unlocks (player_id, item_id) values ('11111111-1111-1111-1111-111111111111', 'crown_of_thorns');
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$ update public.player_loadouts set helmet_id = 'crown_of_thorns' where player_id = '11111111-1111-1111-1111-111111111111' $$,
  'equipping a helmet_id that IS present in player_unlocks succeeds'
);

-- --- Test 4: authenticated/anon can't insert into match_participants -------
select throws_ok(
  $$ insert into public.match_participants (match_id, player_id, placement) values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 1) $$,
  '42501',
  null,
  'authenticated cannot insert into match_participants (no insert policy exists at all)'
);

reset role;
set local role anon;
select throws_ok(
  $$ insert into public.match_participants (match_id, player_id, placement) values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 1) $$,
  '42501',
  null,
  'anon cannot insert into match_participants either'
);

-- --- Test 5: authenticated/anon can't call record_match_result -------------
reset role;
set local role authenticated;
select throws_ok(
  $$ select public.record_match_result('{}'::jsonb) $$,
  '42501',
  null,
  'authenticated cannot call record_match_result (execute revoked from public, granted only to service_role)'
);

-- --- Test 6: the leaderboard view exposes no email/auth columns ------------
reset role;
select is(
  (
    select count(*)::int
    from information_schema.columns
    where table_schema = 'public' and table_name = 'leaderboard'
      and column_name in ('email', 'id', 'phone', 'encrypted_password')
  ),
  0,
  'leaderboard view has no email/id/phone/password-shaped column'
);

-- --- Test 10-11: a player can read their own player_stats row but not --
-- another's (Phase 9's addition to Phase 8's default-deny table) ----------
reset role;
insert into public.player_stats (player_id, wins) values ('11111111-1111-1111-1111-111111111111', 7);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select wins from public.player_stats where player_id = '11111111-1111-1111-1111-111111111111'),
  7,
  'user A can select their own player_stats row'
);

select is(
  (select count(*)::int from public.player_stats where player_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'user A cannot select user B''s player_stats row'
);

select * from finish();
rollback;
