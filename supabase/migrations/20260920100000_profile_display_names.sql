-- Phase 12: players name themselves. `profiles.display_name` (citext, unique) has
-- existed since Phase 8 but nothing ever set it, so it was null for everyone and
-- the leaderboard/results screens fell back to raw ids. This migration is the
-- database half of making it settable safely:
--
--   1. a shape constraint (3-16 of A-Z a-z 0-9 _ -, and not the reserved
--      `Guest-XXXX` label the game generates for players with no name). Mirrors
--      `validateDisplayName` in packages/shared/src/profile/displayName.ts — keep
--      the two in step. The blocked-word list is deliberately NOT here.
--   2. the update policy now refuses anonymous guests: a name puts a row on the
--      public leaderboard, and guests stay off it until they link an account
--      (plan decision D3).
--   3. authenticated may update only `display_name`, not `id`/`created_at`.
--
-- Expand-only, so a rollback of the server or client never needs this reverted:
-- the constraint is NOT VALID (checked for every new write, but existing rows are
-- not scanned, so a stray pre-existing value can never fail the deploy), and no
-- released client or server writes `profiles` at all — the game server uses
-- service_role, which these grants do not touch.
alter table public.profiles
  add constraint profiles_display_name_shape
  check (
    display_name is null
    or (
      display_name::text ~ '^[A-Za-z0-9_-]{3,16}$'
      and display_name::text !~* '^guest[-_]?[0-9a-f]{4}$'
    )
  ) not valid;

drop policy "users can update their own profile" on public.profiles;

create policy "signed-in users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

revoke update on public.profiles from authenticated, anon;
grant update (display_name) on public.profiles to authenticated;
