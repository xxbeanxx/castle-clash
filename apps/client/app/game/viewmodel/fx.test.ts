// @vitest-environment node
import { PLAYER_HEIGHT, PLAYER_WIDTH, playerId, type SimEvent } from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import {
  ALL_FX_KINDS,
  DODGE_TRAIL_MS,
  RUN_DUST_MS,
  actorOf,
  ambientFx,
  fxForEvents,
  makeParticles,
  makeRng,
  stepParticle,
  type FxActor,
  type FxWorld,
} from "./fx.js";

const actor = (x: number, facing: 1 | -1 = 1): FxActor => ({ x, feetY: 500, chestY: 470, facing });

function world(
  actors: Record<string, FxActor>,
  hazards: Record<string, { x: number; y: number }> = {},
): FxWorld {
  return { actor: (id) => actors[id], hazardCenter: (id) => hazards[id] };
}

describe("makeParticles", () => {
  it("is a pure function of its seed", () => {
    const spawn = { kind: "hit", x: 10, y: 20, dir: 1 } as const;
    expect(makeParticles(spawn, makeRng(7))).toEqual(makeParticles(spawn, makeRng(7)));
    expect(makeParticles(spawn, makeRng(7))).not.toEqual(makeParticles(spawn, makeRng(8)));
  });

  it.each(ALL_FX_KINDS)(
    "%s: makes finite, living, whole-pixel particles at the spawn point",
    (kind) => {
      const particles = makeParticles({ kind, x: 100, y: 200, dir: -1 }, makeRng(1));
      expect(particles.length).toBeGreaterThan(0);
      for (const p of particles) {
        for (const v of [p.x, p.y, p.vx, p.vy, p.life, p.gravity, p.drag]) {
          expect(Number.isFinite(v)).toBe(true);
        }
        expect([p.x, p.y]).toEqual([100, 200]);
        expect(p.life).toBeGreaterThan(0);
        expect(p.life).toBe(p.maxLife);
        expect(Number.isInteger(p.size) && p.size >= 1).toBe(true);
        expect(p.color).toBeGreaterThanOrEqual(0);
        expect(p.color).toBeLessThanOrEqual(0xffffff);
      }
    },
  );

  it("throws sparks the way the burst points, and all round for a KO", () => {
    const meanVx = (kind: "hit" | "ko", dir: 1 | -1) => {
      const ps = makeParticles({ kind, x: 0, y: 0, dir }, makeRng(3));
      return ps.reduce((sum, p) => sum + p.vx, 0) / ps.length;
    };
    expect(meanVx("hit", 1)).toBeGreaterThan(50);
    expect(meanVx("hit", -1)).toBeLessThan(-50);
    expect(Math.abs(meanVx("ko", 1))).toBeLessThan(150);
  });
});

describe("stepParticle", () => {
  it("moves, falls under gravity, slows under drag, and dies when its life is spent", () => {
    const [p] = makeParticles({ kind: "hit", x: 0, y: 0, dir: 1 }, makeRng(1));
    const before = { ...p! };
    expect(stepParticle(p!, 0.05)).toBe(true);
    expect(p!.x).not.toBe(before.x);
    expect(p!.vy).toBeGreaterThan(before.vy); // gravity is down
    expect(Math.abs(p!.vx)).toBeLessThan(Math.abs(before.vx)); // drag
    expect(stepParticle(p!, 10)).toBe(false);
  });

  it("never reverses horizontal motion under drag, however long the step", () => {
    const [p] = makeParticles({ kind: "landDust", x: 0, y: 0, dir: 1 }, makeRng(2));
    const sign = Math.sign(p!.vx);
    stepParticle(p!, p!.life * 0.9);
    expect(Math.sign(p!.vx) === sign || p!.vx === 0).toBe(true);
  });
});

describe("fxForEvents", () => {
  const W = world({ a: actor(100, 1), d: actor(160, -1) });

  it("sparks fly away from the attacker, from the defender's chest", () => {
    const events: SimEvent[] = [{ type: "hit", attacker: playerId("a"), defender: playerId("d") }];
    expect(fxForEvents(events, W)).toEqual([{ kind: "hit", x: 160, y: 470, dir: 1 }]);
    const flipped = world({ a: actor(200), d: actor(160) });
    expect(fxForEvents(events, flipped)[0]?.dir).toBe(-1);
  });

  it("puts a block's sparks on the shield side and gives a guard break and a KO their own bursts", () => {
    const [block] = fxForEvents(
      [{ type: "blocked", attacker: playerId("a"), defender: playerId("d") }],
      W,
    );
    expect(block).toMatchObject({ kind: "block", dir: 1, x: 150 });
    expect(
      fxForEvents([{ type: "guardBreak", attacker: playerId("a"), defender: playerId("d") }], W)[0]
        ?.kind,
    ).toBe("guardBreak");
    expect(
      fxForEvents([{ type: "ko", attacker: playerId("a"), defender: playerId("d") }], W)[0]?.kind,
    ).toBe("ko");
  });

  it("makes dust for jumps and landings at the feet", () => {
    expect(fxForEvents([{ type: "jump", playerId: playerId("a") }], W)).toEqual([
      { kind: "jumpDust", x: 100, y: 500, dir: 1 },
    ]);
    expect(fxForEvents([{ type: "land", playerId: playerId("d") }], W)[0]?.kind).toBe("landDust");
  });

  it("bursts debris from a broken hazard, sparks on each trap victim, and a shield flash", () => {
    const w = world({ a: actor(100), d: actor(160) }, { plank: { x: 400, y: 700 } });
    expect(fxForEvents([{ type: "hazardBreak", hazardId: "plank" }], w)).toEqual([
      { kind: "debris", x: 400, y: 700, dir: 1 },
    ]);
    const trap = fxForEvents(
      [{ type: "hazardTrap", hazardId: "t", victims: [playerId("a"), playerId("d")] }],
      w,
    );
    expect(trap.map((s) => s.kind)).toEqual(["hit", "hit"]);
    expect(fxForEvents([{ type: "ringOutArmorUsed", playerId: playerId("a") }], w)[0]?.kind).toBe(
      "armor",
    );
  });

  it("makes nothing for whiffs and eliminations, and drops what it cannot place", () => {
    expect(fxForEvents([{ type: "whiff", attacker: playerId("a") }], W)).toEqual([]);
    expect(fxForEvents([{ type: "eliminated", victim: playerId("d"), cause: "ko" }], W)).toEqual(
      [],
    );
    expect(
      fxForEvents([{ type: "hit", attacker: playerId("a"), defender: playerId("gone") }], W),
    ).toEqual([]);
    expect(fxForEvents([{ type: "jump", playerId: playerId("gone") }], W)).toEqual([]);
    expect(fxForEvents([{ type: "hazardBreak", hazardId: "gone" }], W)).toEqual([]);
  });
});

describe("actorOf", () => {
  it("aims at the hitbox's centre, chest and feet", () => {
    const a = actorOf({ x: 100, y: 200, facing: -1 });
    expect(a.x).toBe(100 + PLAYER_WIDTH / 2);
    expect(a.feetY).toBe(200 + PLAYER_HEIGHT);
    expect(a.chestY).toBeGreaterThan(200);
    expect(a.chestY).toBeLessThan(a.feetY);
    expect(a.facing).toBe(-1);
  });
});

describe("ambientFx", () => {
  const run = (id: string, action: string, x = 100) => ({ id, action, actor: actor(x, 1) });

  it("kicks up dust behind a running knight on a fixed cadence, and only while running", () => {
    const clocks = new Map<string, number>();
    const first = ambientFx([run("a", "Run")], 16, clocks);
    expect(first).toEqual([expect.objectContaining({ kind: "runDust", dir: -1 })]);
    expect(first[0]!.x).toBeLessThan(100); // behind a knight facing right
    let puffs = 0;
    for (let ms = 0; ms < 1000; ms += 16) {
      puffs += ambientFx([run("a", "Run")], 16, clocks).length;
    }
    expect(puffs).toBeGreaterThanOrEqual(Math.floor(1000 / RUN_DUST_MS) - 1);
    expect(puffs).toBeLessThanOrEqual(Math.ceil(1000 / RUN_DUST_MS) + 1);
    expect(ambientFx([run("a", "Idle")], 16, clocks)).toEqual([]);
  });

  it("leaves a quicker trail at a rolling knight's chest, and forgets knights that stopped or left", () => {
    const clocks = new Map<string, number>();
    const [trail] = ambientFx([run("a", "Dodge")], 16, clocks);
    expect(trail).toMatchObject({ kind: "dodge", y: 470 });
    expect(DODGE_TRAIL_MS).toBeLessThan(RUN_DUST_MS);
    ambientFx([], 16, clocks);
    expect(clocks.size).toBe(0);
  });
});
