import { MapSchema, Schema, type } from "@colyseus/schema";

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
}

export class MatchState extends Schema {
  @type("number") tick = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
