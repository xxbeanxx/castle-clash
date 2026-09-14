import { MapSchema, Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") colorSeed = 0;
}

export class MatchState extends Schema {
  @type("number") tick = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
