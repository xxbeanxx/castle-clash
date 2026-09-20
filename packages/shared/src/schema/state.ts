import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import { MAX_HP, MAX_STAMINA } from "../config/game.js";
import { WEAPON_IDS } from "../types/ids.js";

/** A player's server-validated cosmetic loadout, synced so every connected
 *  client — not just the player themselves — can render it (plan Phase 9
 *  step 3: "server-validated cosmetics visible to all players in a
 *  match"). `MatchRoom.onJoin` is the only writer: it resolves the raw
 *  `player_loadouts` row through `resolveCosmeticSelection()` against the
 *  player's own `player_unlocks` before ever setting these fields, so an
 *  unowned or removed catalog id can never reach a connected client's
 *  screen (`db/cosmetics.ts`'s doc comment covers the "invalid -> default"
 *  fallback in full). `helmetId`/`capeId`/`weaponStyleId` hold a
 *  `COSMETIC_CATALOG` item id, always that slot's `default` item id rather
 *  than an empty-string sentinel — there's no "equipped nothing" state
 *  distinct from "equipped the default." */
export class CosmeticsState extends Schema {
  @type("string") helmetId = "";
  @type("string") capeId = "";
  @type("string") weaponStyleId = "";
  @type("number") tintPrimary = 0;
  @type("number") tintSecondary = 0;
}

export class PlayerState extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") colorSeed = 0;
  /** What other players see: the profile's display name, or the derived
   *  `Guest-XXXX` label for someone without one (Phase 12). Set once at
   *  `onJoin`; empty only for a client talking to an older server. */
  @type("string") name = "";
  /** The input `seq` the server has folded into this player's authoritative
   *  state — the reconcile ack the owning client drops its pending buffer
   *  against. Harmless noise to every other connected client. */
  @type("number") lastProcessedSeq = 0;

  // Full physics state, not just position: the owning client's Reconciler
  // replays pending inputs through GameSimulation.step() starting from this
  // exact SimPlayer, so an approximation here (e.g. assuming vel=0,
  // grounded=false) would replay a different trajectory than the server did
  // and reintroduce the jank reconciliation exists to remove.
  @type("number") vx = 0;
  @type("number") vy = 0;
  @type("number") facing = 1;
  @type("boolean") grounded = false;
  @type("number") coyoteTicks = 0;
  @type("number") jumpBufferTicks = 0;
  @type("number") dropThroughTicks = 0;

  // Combat (Phase 4). `action`/`attackKind` are synced as strings rather
  // than a numeric enum so clients never need the FSM's state table just to
  // read them off the wire — see `combat/types.ts` for the closed set of
  // values each one actually takes.
  @type("string") weapon: string = WEAPON_IDS.SWORD;
  @type("string") action = "Idle";
  @type("number") actionTick = 0;
  @type("string") attackKind = "";
  @type("number") hp = MAX_HP;
  @type("number") stamina = MAX_STAMINA;
  @type("number") hitstunTicks = 0;
  @type("number") invulnTicks = 0;
  @type("number") hitConfirmTicks = 0;
  @type("number") comboCount = 0;
  /** Empty string sentinel for `null` (no `@colyseus/schema` primitive is
   *  nullable) — mirrors `attackKind`'s convention above. */
  @type("string") lastHitBy = "";
  @type("number") lastHitTick = 0;

  // Match flow (Phase 5).
  @type("number") roundsWon = 0;
  @type("boolean") alive = true;
  @type("boolean") spectator = false;

  // Power-up draft (Phase 7). One entry per stack owned — a power-up owned
  // at 3 stacks appears 3 times, so opponents (and `hud.ts`'s HudPlayerSnapshot)
  // can read stack counts straight off `.length`/a tally without a separate
  // synced map. Deliberately public (plan step 4): opponents can see builds;
  // only the draft *offers* themselves (`DraftService`/`MESSAGE_TYPES.
  // DRAFT_OFFER`) are private.
  @type(["string"]) powerups = new ArraySchema<string>();
  /** Extra mid-air jumps used since last grounded (`doubleJump`'s
   *  `airJumpsUsed`) — synced so a reconciling client's `schemaToSimPlayer`
   *  seeds prediction from the exact same counter the server has, the same
   *  reasoning `coyoteTicks`/`jumpBufferTicks` above already follow. */
  @type("number") airJumpsUsed = 0;
  /** `ringOutArmor` charges spent so far this match — same reconciliation
   *  reasoning as `airJumpsUsed`. */
  @type("number") ringOutArmorChargesUsed = 0;

  // Customization (Phase 9). See `CosmeticsState`'s doc comment above.
  @type(CosmeticsState) cosmetics = new CosmeticsState();
}

/** Dynamic per-hazard state (Phase 6 plan step 4's `MatchState.hazards:
 *  MapSchema<HazardState {id, kind, active, hp, phase}>` — `timer` is an
 *  addition beyond that field list; see `hazards/types.ts`'s
 *  `HazardRuntimeState` for why). Static hazard geometry (`box`, `dps`,
 *  `periodTicks`, ...) is never sent — the client loads it from `shared`'s
 *  arena registry by `MatchState.arenaId` instead, the same way the rest of
 *  the arena's geometry is never synced. */
export class HazardState extends Schema {
  @type("string") id = "";
  @type("string") kind = "";
  @type("boolean") active = true;
  @type("number") hp = 0;
  @type("string") phase = "";
  @type("number") timer = 0;
}

export class MatchState extends Schema {
  @type("number") tick = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();

  // Match flow (Phase 5).
  @type("string") phase = "Waiting";
  @type("number") round = 0;
  /** `-1` sentinel for "no scheduled end" (`Waiting`/`RoundActive` outside a
   *  time limit/`MatchOver`) — tick 0 is itself a valid absolute tick, so it
   *  can't double as the sentinel. */
  @type("number") phaseEndsAtTick = -1;
  /** Ticks since sudden death began this round (Phase 14); 0 when it has not. The client only
   *  needs "is it on" for a banner, but the number lets it show the damage ramp. */
  @type("number") suddenDeathTicks = 0;

  // Arenas and hazards (Phase 6). `arenaId` is set once, at `onCreate`, and
  // never changes for the rest of the match (arena rotation is per-match,
  // not per-round — see `docs/research/phase6-arena-scope-deviations.md`).
  @type("string") arenaId = "";
  @type({ map: HazardState }) hazards = new MapSchema<HazardState>();
}
