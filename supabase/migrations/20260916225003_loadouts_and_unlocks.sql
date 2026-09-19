-- Phase 8 step 2: persisted loadout + unlock ledger.
--
-- `weapon` is constrained to the three base weapons `@castle-clash/shared`'s
-- `WEAPON_IDS` already defines (packages/shared/src/types/ids.ts) — this
-- game has no weapon-unlock gameplay yet (every match lets a player pick any
-- of the three), so `weapon` is validated by a plain CHECK, not the
-- unlock-gated RLS check `helmet_id`/`cape_id`/`weapon_style_id` get below.
-- Widening this CHECK is how a future weapon-unlock system would extend it.
--
-- `helmet_id`/`cape_id`/`weapon_style_id` are nullable: `null` means "no
-- cosmetic equipped" and is always allowed (this phase's own "a default" —
-- there's no separate sentinel string). Any non-null value must be a row in
-- `player_unlocks` for that player, enforced by the RLS `with check` in the
-- migration that creates `player_unlocks` (that table has to exist first).
create table public.player_loadouts (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  weapon text not null default 'sword' check (weapon in ('sword', 'mace', 'spear')),
  tint_primary integer not null default 0 check (tint_primary between 0 and 16777215),
  tint_secondary integer not null default 0 check (tint_secondary between 0 and 16777215),
  helmet_id text,
  cape_id text,
  weapon_style_id text,
  updated_at timestamptz not null default now()
);

comment on table public.player_loadouts is
  'Persisted gameplay/cosmetic choices. tint_* are 24-bit RGB ints (0-16777215).';

create table public.player_unlocks (
  player_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (player_id, item_id)
);

alter table public.player_loadouts enable row level security;
alter table public.player_unlocks enable row level security;

-- Shared by both the insert and update policies below (they'd otherwise
-- repeat this exact three-clause check verbatim) — `stable`, not `volatile`,
-- since it only reads; `security invoker` (the default) so it runs under
-- the calling role's own RLS-scoped view of `player_unlocks`, identical to
-- inlining the `exists(...)` clauses directly.
create function public.player_owns_cosmetics(
  p_player_id uuid, p_helmet_id text, p_cape_id text, p_weapon_style_id text
)
returns boolean
language sql
stable
as $$
  select
    (p_helmet_id is null or exists (
      select 1 from public.player_unlocks
      where player_id = p_player_id and item_id = p_helmet_id
    ))
    and (p_cape_id is null or exists (
      select 1 from public.player_unlocks
      where player_id = p_player_id and item_id = p_cape_id
    ))
    and (p_weapon_style_id is null or exists (
      select 1 from public.player_unlocks
      where player_id = p_player_id and item_id = p_weapon_style_id
    ));
$$;

create policy "players can view their own loadout"
  on public.player_loadouts for select
  to authenticated
  using (player_id = (select auth.uid()));

-- `insert`+`update` (rather than one `for all`) so the unlock check applies
-- identically to a first-time upsert and a later edit — `with check` alone
-- covers both `for insert` and `for update` policies, but only if each
-- statement type has its own policy naming that check (a single combined
-- policy on `insert, update` would need Postgres 15's multi-command RLS
-- policy syntax, which `for insert, update` on one policy already supports;
-- named separately here for clearer failure messages per operation).
create policy "players can insert their own loadout"
  on public.player_loadouts for insert
  to authenticated
  with check (
    player_id = (select auth.uid())
    and public.player_owns_cosmetics(player_id, helmet_id, cape_id, weapon_style_id)
  );

create policy "players can update their own loadout"
  on public.player_loadouts for update
  to authenticated
  using (player_id = (select auth.uid()))
  with check (
    player_id = (select auth.uid())
    and public.player_owns_cosmetics(player_id, helmet_id, cape_id, weapon_style_id)
  );

-- `player_unlocks` itself: select-only for its owner. Every row is written
-- by the service role (a future unlock-granting flow, out of this phase's
-- scope) — no authenticated-role insert policy exists on purpose, matching
-- `matches`/`match_participants` below.
create policy "players can view their own unlocks"
  on public.player_unlocks for select
  to authenticated
  using (player_id = (select auth.uid()));
