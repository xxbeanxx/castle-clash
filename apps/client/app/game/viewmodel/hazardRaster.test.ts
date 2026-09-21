// @vitest-environment node
import { readFileSync } from "node:fs";
import { ALL_ARENAS, TUTORIAL_ARENA, type HazardKind } from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import { renderBackground, renderTerrain } from "./arenaRaster.js";
import { themeFor } from "./arenaThemes.js";
import { FALL_MS, hazardVisual, isGate, paintHazard } from "./hazardRaster.js";
import type { HazardRect } from "./hazardsToRects.js";
import { createRaster, type Raster } from "./raster.js";

function rect(kind: HazardKind, phase: string, extra: Partial<HazardRect> = {}): HazardRect {
  return {
    id: "h",
    kind,
    x: 0,
    y: 0,
    w: 60,
    h: 40,
    active: true,
    phase,
    hp: 0,
    maxHp: 0,
    ...extra,
  };
}

describe("hazardVisual", () => {
  it("animates a lit fire zone through four frames and shows embers when it is off", () => {
    const keys = new Set(
      [0, 110, 220, 330, 440].map((t) => hazardVisual(rect("fireZone", "on"), t, 0).key),
    );
    expect(keys).toEqual(new Set(["flame-0", "flame-1", "flame-2", "flame-3"]));
    expect(hazardVisual(rect("fireZone", "off", { active: false }), 0, 0).key).toBe("embers");
  });

  it("tells a timed trap's three phases apart, and blinks the warning", () => {
    expect(hazardVisual(rect("timedTrap", "idle"), 0, 0).key).toBe("spikes-idle");
    expect(hazardVisual(rect("timedTrap", "active"), 0, 0).key).toBe("spikes-active");
    const warn = [0, 90].map((t) => hazardVisual(rect("timedTrap", "warn"), t, 0));
    expect(warn.every((v) => v.key === "spikes-warn")).toBe(true);
    expect(new Set(warn.map((v) => v.alpha)).size).toBe(2);
  });

  it("draws a tall timed trap as a gate", () => {
    const gate = rect("timedTrap", "active", { w: 40, h: 360 });
    expect(isGate(gate)).toBe(true);
    expect(hazardVisual(gate, 0, 0).key).toBe("gate-active");
  });

  it("cracks a breakable floor as it loses hit points, and hides it once broken", () => {
    const floor = (hp: number, active = true) =>
      rect("breakableFloor", "solid", { hp, maxHp: 16, active });
    expect(hazardVisual(floor(16), 0, 0).key).toBe("block-0");
    expect(hazardVisual(floor(12), 0, 0).key).toBe("block-1");
    expect(hazardVisual(floor(4), 0, 0).key).toBe("block-2");
    expect(hazardVisual(floor(0, false), 0, 0).visible).toBe(false);
  });

  it("shakes a warning platform, then drops and fades a fallen one until it is gone", () => {
    const shaking = rect("collapsingPlatform", "shaking");
    expect(new Set([0, 50].map((t) => hazardVisual(shaking, t, 0).dx)).size).toBe(2);
    const fallen = rect("collapsingPlatform", "fallen", { active: false });
    const early = hazardVisual(fallen, 0, 100);
    const later = hazardVisual(fallen, 0, 300);
    expect(later.dy).toBeGreaterThan(early.dy);
    expect(later.alpha).toBeLessThan(early.alpha);
    expect(hazardVisual(fallen, 0, FALL_MS).visible).toBe(false);
  });

  it("always shows a kill zone", () => {
    expect(hazardVisual(rect("killZone", ""), 0, 0).key).toBe("abyss");
  });
});

/** Every image key a hazard can ask for, in the states `hazardVisual` produces. */
const KEYS = [
  ...[0, 1, 2, 3].map((i) => `flame-${i}`),
  "embers",
  ...["idle", "warn", "active"].flatMap((p) => [`spikes-${p}`, `gate-${p}`]),
  "block-0",
  "block-1",
  "block-2",
  "abyss",
];

describe("world art coverage", () => {
  const atlas = JSON.parse(
    readFileSync(new URL("../../../public/assets/world/world.json", import.meta.url), "utf8"),
  ) as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> };

  /** Hands back a small opaque sprite and remembers every name asked for. */
  function recorder(): { names: Set<string>; sprite: (name: string) => Raster } {
    const names = new Set<string>();
    return {
      names,
      sprite(name) {
        names.add(name);
        const r = createRaster(16, 16);
        r.data.fill(255);
        return r;
      },
    };
  }

  it("asks the atlas only for frames it has, across every arena, theme and hazard state", () => {
    const { names, sprite } = recorder();
    for (const arena of [...ALL_ARENAS, TUTORIAL_ARENA]) {
      const theme = themeFor(arena.id);
      renderBackground(arena, theme, sprite);
      renderTerrain(arena, theme, sprite);
      for (const key of KEYS) {
        for (const hazard of arena.hazards) {
          paintHazard(key, hazard.box.w / 2, hazard.box.h / 2, theme, sprite);
        }
      }
    }
    for (const name of names) {
      expect(atlas.frames[name], name).toBeDefined();
    }
    expect(names.size).toBeGreaterThan(10);
  });

  it("paints every hazard at exactly its box size, in every state it can be in", () => {
    const { sprite } = recorder();
    for (const arena of ALL_ARENAS) {
      for (const hazard of arena.hazards) {
        const w = hazard.box.w / 2;
        const h = hazard.box.h / 2;
        for (const key of KEYS) {
          const image = paintHazard(key, w, h, themeFor(arena.id), sprite);
          expect([image.w, image.h], `${arena.id}/${hazard.id}/${key}`).toEqual([w, h]);
        }
      }
    }
  });

  it("has art for every hazard kind an arena uses", () => {
    const kinds = new Set(ALL_ARENAS.flatMap((a) => a.hazards.map((h) => h.kind)));
    expect(kinds).toEqual(
      new Set<HazardKind>([
        "fireZone",
        "breakableFloor",
        "killZone",
        "timedTrap",
        "collapsingPlatform",
      ]),
    );
    for (const kind of kinds) {
      const visual = hazardVisual(
        rect(kind, kind === "collapsingPlatform" ? "stable" : "on"),
        0,
        0,
      );
      expect(visual.visible, kind).toBe(true);
    }
  });
});
