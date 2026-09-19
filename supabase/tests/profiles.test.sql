-- pgTAP tests for Phase 12's display-name rules (see
-- 20260920100000_profile_display_names.sql). Same "act as user X" technique as
-- rls.test.sql: `request.jwt.claims` plus `set local role authenticated`.
begin;
select plan(9);

insert into auth.users (id, is_anonymous) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', true);

-- --- user A -------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated', 'is_anonymous', false)::text, true);
set local role authenticated;

select lives_ok(
  $$ update public.profiles set display_name = 'Sir_Kay' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'a signed-in user can set their own display name'
);

-- B's row is invisible to A's update (RLS filters it to zero rows, no error).
update public.profiles set display_name = 'Hijacked' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
reset role;
select is(
  (select display_name::text from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  null,
  'a user cannot set another user''s display name'
);

-- --- shape constraint ---------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'role', 'authenticated', 'is_anonymous', false)::text, true);
set local role authenticated;

select throws_ok(
  $$ update public.profiles set display_name = 'sir_kay' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  '23505',
  null,
  'a name that differs only by case from an existing one is rejected (citext unique)'
);

select throws_ok(
  $$ update public.profiles set display_name = 'ab' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  '23514',
  null,
  'a two-character name violates the shape constraint'
);

select throws_ok(
  $$ update public.profiles set display_name = 'this_name_is_way_too_long' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  '23514',
  null,
  'a name over 16 characters violates the shape constraint'
);

select throws_ok(
  $$ update public.profiles set display_name = 'has space' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  '23514',
  null,
  'a name outside the allow-listed characters violates the shape constraint'
);

select throws_ok(
  $$ update public.profiles set display_name = 'Guest-7F3A' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  '23514',
  null,
  'the reserved Guest-XXXX label cannot be registered as a name'
);

-- --- only display_name is writable --------------------------------------------
select throws_ok(
  $$ update public.profiles set created_at = now() - interval '10 years' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  '42501',
  null,
  'authenticated cannot update any column other than display_name'
);

-- --- guests cannot name themselves --------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'role', 'authenticated', 'is_anonymous', true)::text, true);
set local role authenticated;

select throws_ok(
  $$ update public.profiles set display_name = 'Sneaky' where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' $$,
  '42501',
  null,
  'an anonymous guest cannot set a display name (they stay off the leaderboard)'
);

select * from finish();
rollback;
