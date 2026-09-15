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
}

export class MatchState extends Schema {
  @type("number") tick = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
