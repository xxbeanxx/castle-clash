import { createSimPlayer, MatchState, PlayerState } from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import { playersToRects } from "./playersToRects.js";

function addPlayer(state: MatchState, id: string, x: number, y: number, colorSeed: number): void {
  const player = new PlayerState();
  player.id = id;
  player.x = x;
  player.y = y;
  player.colorSeed = colorSeed;
  state.players.set(id, player);
}

describe("playersToRects", () => {
  it("returns an empty array for an empty state", () => {
    expect(playersToRects(new MatchState())).toEqual([]);
  });

  it("maps each player to a rect carrying its id, position, tint, and action", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 10, 20, 0xff00ff);

    expect(playersToRects(state)).toMatchObject([
      {
        id: "p1",
        x: 10,
        y: 20,
        tint: 0xff00ff,
        action: "Idle",
        helmetTint: undefined,
        capeTint: undefined,
      },
    ]);
  });

  it("carries a player's equipped helmet/cape tint through, and omits an unequipped slot's", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 0, 0, 1);
    state.players.get("p1")!.cosmetics.helmetId = "helmet-gold";
    state.players.get("p1")!.cosmetics.capeId = "cape-none";

    const [rect] = playersToRects(state);
    expect(rect?.helmetTint).toBe(0xffd700);
    expect(rect?.capeTint).toBeUndefined();
  });

  it("carries the player's current action through", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 0, 0, 1);
    state.players.get("p1")!.action = "Block";

    expect(playersToRects(state)[0]?.action).toBe("Block");
  });

  it("gives the same tint for the same colorSeed across separate calls", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 0, 0, 12345);

    const [first] = playersToRects(state);
    const [second] = playersToRects(state);

    expect(first?.tint).toBe(second?.tint);
  });

  it("substitutes a position override for a player when one is given", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 10, 20, 0xff00ff);

    expect(playersToRects(state, { p1: { x: 99, y: 88 } })).toMatchObject([
      {
        id: "p1",
        x: 99,
        y: 88,
        tint: 0xff00ff,
        action: "Idle",
        helmetTint: undefined,
        capeTint: undefined,
      },
    ]);
  });

  it("falls back to schema position for a player with no override", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 10, 20, 1);
    addPlayer(state, "p2", 30, 40, 2);

    expect(playersToRects(state, { p1: { x: 99, y: 88 } })).toMatchObject([
      {
        id: "p1",
        x: 99,
        y: 88,
        tint: 1,
        action: "Idle",
        helmetTint: undefined,
        capeTint: undefined,
      },
      {
        id: "p2",
        x: 30,
        y: 40,
        tint: 2,
        action: "Idle",
        helmetTint: undefined,
        capeTint: undefined,
      },
    ]);
  });

  it("carries what the knight animation needs: tick, attack kind, weapon, facing, vy", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 0, 0, 1);
    const p = state.players.get("p1")!;
    p.actionTick = 4;
    p.attackKind = "heavy";
    p.weapon = "spear";
    p.facing = -1;
    p.vy = -120;

    expect(playersToRects(state)[0]).toMatchObject({
      actionTick: 4,
      attackKind: "heavy",
      weapon: "spear",
      facing: -1,
      vy: -120,
    });
  });

  it("takes the local player's combat fields from the predicted state, not the schema", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 0, 0, 1);
    addPlayer(state, "p2", 0, 0, 2);
    const predicted = {
      ...createSimPlayer({ x: 0, y: 0 }),
      action: "AttackActive" as const,
      actionTick: 2,
      attackKind: "light" as const,
      facing: -1 as const,
      vel: { x: 0, y: 50 },
    };

    const [own, other] = playersToRects(state, {}, { id: "p1", player: predicted });
    expect(own).toMatchObject({
      action: "AttackActive",
      actionTick: 2,
      attackKind: "light",
      facing: -1,
      vy: 50,
    });
    expect(other).toMatchObject({ action: "Idle", actionTick: 0, attackKind: "", facing: 1 });
  });

  it("omits players who are no longer in state", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 0, 0, 1);
    addPlayer(state, "p2", 5, 5, 2);

    state.players.delete("p1");

    expect(playersToRects(state).map((rect) => rect.id)).toEqual(["p2"]);
  });
});
