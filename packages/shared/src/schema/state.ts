import { MapSchema, Schema, type } from "@colyseus/schema";
import { MAX_HP, MAX_STAMINA } from "../config/game.js";
import { WEAPON_IDS } from "../types/ids.js";

export class PlayerState extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") colorSeed = 0;
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
}

export class MatchState extends Schema {
  @type("number") tick = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
