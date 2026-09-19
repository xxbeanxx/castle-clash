import { describe, expect, it } from "vitest";
import { TESTBED_ARENA } from "../arenas/testbed.js";
import { powerUpId } from "../powerups/types.js";
import { createSimPlayer, type SimState } from "../sim/types.js";
import { playerId } from "../types/ids.js";
import { projectToSchema, schemaToSimPlayer } from "./project.js";
import { HazardState, MatchState, PlayerState } from "./state.js";

const P1 = playerId("p1");
const SHARP_EDGE = powerUpId("sharpEdge");
const AERIALIST_BOOTS = powerUpId("aerialistBoots");

function simState(overrides: Partial<SimState> = {}): SimState {
  return {
    tick: 5,
    players: { [P1]: createSimPlayer({ x: 111, y: 222 }) },
    arena: TESTBED_ARENA,
    rngSeed: 1,
    ...overrides,
  };
}

describe("projectToSchema", () => {
  it("copies tick and each existing schema player's position from sim state", () => {
    const match = new MatchState();
    const schemaPlayer = new PlayerState();
    schemaPlayer.id = P1;
    match.players.set(P1, schemaPlayer);

    projectToSchema(simState(), match, {});

    expect(match.tick).toBe(5);
    expect(match.players.get(P1)!.x).toBe(111);
    expect(match.players.get(P1)!.y).toBe(222);
  });

  it("does not create schema players — MatchRoom owns join/leave lifecycle", () => {
    const match = new MatchState();
    projectToSchema(simState(), match, {});
    expect(match.players.size).toBe(0);
  });

  it("stamps lastProcessedSeq per player from the given ack map", () => {
    const match = new MatchState();
    const schemaPlayer = new PlayerState();
    schemaPlayer.id = P1;
    match.players.set(P1, schemaPlayer);

    projectToSchema(simState(), match, { [P1]: 42 });

    expect(match.players.get(P1)!.lastProcessedSeq).toBe(42);
  });

  it("copies full physics state, not just position", () => {
    const match = new MatchState();
    const schemaPlayer = new PlayerState();
    schemaPlayer.id = P1;
    match.players.set(P1, schemaPlayer);

    const player = createSimPlayer({ x: 1, y: 2 });
    player.vel = { x: 30, y: -40 };
    player.facing = -1;
    player.grounded = true;
    player.coyoteTicks = 3;
    player.jumpBufferTicks = 4;
    player.dropThroughTicks = 5;

    projectToSchema(simState({ players: { [P1]: player } }), match, {});

    const synced = match.players.get(P1)!;
    expect(synced.vx).toBe(30);
    expect(synced.vy).toBe(-40);
    expect(synced.facing).toBe(-1);
    expect(synced.grounded).toBe(true);
    expect(synced.coyoteTicks).toBe(3);
    expect(synced.jumpBufferTicks).toBe(4);
    expect(synced.dropThroughTicks).toBe(5);
  });
});

describe("projectToSchema — hazards", () => {
  it("updates an existing schema hazard entry's dynamic fields", () => {
    const match = new MatchState();
    const schemaHazard = new HazardState();
    schemaHazard.id = "floor";
    schemaHazard.kind = "breakableFloor";
    match.hazards.set("floor", schemaHazard);

    projectToSchema(
      simState({ hazards: { floor: { id: "floor", kind: "breakableFloor", active: false, hp: 0, phase: "broken", timer: 0 } } }),
      match,
      {},
    );

    const synced = match.hazards.get("floor")!;
    expect(synced.active).toBe(false);
    expect(synced.hp).toBe(0);
    expect(synced.phase).toBe("broken");
  });

  it("does not create schema hazard entries — MatchRoom owns that lifecycle", () => {
    const match = new MatchState();
    projectToSchema(
      simState({ hazards: { floor: { id: "floor", kind: "breakableFloor", active: true, hp: 16, phase: "solid", timer: 0 } } }),
      match,
      {},
    );
    expect(match.hazards.size).toBe(0);
  });
});

describe("projectToSchema — power-ups", () => {
  it("flattens stack counts into one array entry per stack, sorted by id", () => {
    const match = new MatchState();
    const schemaPlayer = new PlayerState();
    schemaPlayer.id = P1;
    match.players.set(P1, schemaPlayer);

    const player = createSimPlayer({ x: 0, y: 0 });
    player.powerups = { [SHARP_EDGE]: 2, [AERIALIST_BOOTS]: 1 };

    projectToSchema(simState({ players: { [P1]: player } }), match, {});

    expect(match.players.get(P1)!.powerups.toArray()).toEqual([
      "aerialistBoots",
      "sharpEdge",
      "sharpEdge",
    ]);
  });

  it("round-trips stack counts through schemaToSimPlayer", () => {
    const match = new MatchState();
    const schemaPlayer = new PlayerState();
    schemaPlayer.id = P1;
    match.players.set(P1, schemaPlayer);

    const player = createSimPlayer({ x: 0, y: 0 });
    player.powerups = { [SHARP_EDGE]: 2, [AERIALIST_BOOTS]: 1 };

    projectToSchema(simState({ players: { [P1]: player } }), match, {});
    const roundTripped = schemaToSimPlayer(match.players.get(P1)!);

    expect(roundTripped.powerups).toEqual({ [SHARP_EDGE]: 2, [AERIALIST_BOOTS]: 1 });
  });
});

describe("schemaToSimPlayer", () => {
  it("is the exact inverse of projectToSchema for one player", () => {
    const match = new MatchState();
    const schemaPlayer = new PlayerState();
    schemaPlayer.id = P1;
    match.players.set(P1, schemaPlayer);

    const player = createSimPlayer({ x: 111, y: 222 });
    player.vel = { x: 30, y: -40 };
    player.facing = -1;
    player.grounded = true;
    player.coyoteTicks = 3;
    player.jumpBufferTicks = 4;
    player.dropThroughTicks = 5;
    player.lastInputSeq = 9;
    // `schemaToSimPlayer` always reconstructs these as concrete values
    // (`{}`/`0`), never `undefined` — set them explicitly here too so the
    // round-trip comparison below isn't comparing "missing" against "present
    // but empty" (`toEqual` treats those as different).
    player.powerups = {};
    player.airJumpsUsed = 0;
    player.ringOutArmorChargesUsed = 0;

    projectToSchema(simState({ players: { [P1]: player } }), match, { [P1]: 9 });

    expect(schemaToSimPlayer(match.players.get(P1)!)).toEqual(player);
  });
});
