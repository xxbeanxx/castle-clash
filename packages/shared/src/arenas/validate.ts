import { PLAYER_HEIGHT, PLAYER_WIDTH } from "../config/game.js";
import { createHazardState, dynamicPlatforms, dynamicSolids } from "../hazards/step.js";
import type { HazardRuntimeState } from "../hazards/types.js";
import { overlaps, type AABB } from "../math/aabb.js";
import type { ArenaDefinition } from "./types.js";

export interface ArenaValidationResult {
  valid: boolean;
  issues: readonly string[];
}

function containsBox(outer: AABB, inner: AABB): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/**
 * A cheap downward check — is there a solid/platform surface (static, or a
 * still-active hazard equivalent at match start) somewhere below `box`,
 * spanning its x-range, within the arena's bounds? Not a real physics
 * simulation (`validate.test.ts` additionally runs one, per spawn, for the
 * stronger guarantee) — this is the always-on half `validateArena` itself
 * can check without running the sim.
 */
function hasGroundBelow(
  box: AABB,
  arena: ArenaDefinition,
  initialHazardState: Readonly<Record<string, HazardRuntimeState>>,
): boolean {
  const surfaces = [
    ...arena.solids,
    ...arena.platforms,
    ...dynamicSolids(arena.hazards, initialHazardState),
    ...dynamicPlatforms(arena.hazards, initialHazardState),
  ];
  return surfaces.some(
    (surface) =>
      surface.y >= box.y + box.h &&
      surface.y + surface.h <= arena.bounds.y + arena.bounds.h &&
      surface.x < box.x + box.w &&
      surface.x + surface.w > box.x,
  );
}

/**
 * Static checks from the plan's step 3 — spawn placement, hazard geometry,
 * id uniqueness, and "something to die to or stand on" exists. Everything
 * here is cheap and arena-data-only; `validate.test.ts` layers a real
 * gravity simulation per spawn on top for the dynamical guarantee this
 * function can't give on its own.
 */
export function validateArena(arena: ArenaDefinition): ArenaValidationResult {
  const issues: string[] = [];
  const initialHazardState = createHazardState(arena.hazards);
  const allSolids = [...arena.solids, ...dynamicSolids(arena.hazards, initialHazardState)];

  const seenHazardIds = new Set<string>();
  for (const hazard of arena.hazards) {
    if (seenHazardIds.has(hazard.id)) {
      issues.push(`duplicate hazard id "${hazard.id}"`);
    }
    seenHazardIds.add(hazard.id);
    if (!containsBox(arena.bounds, hazard.box)) {
      issues.push(`hazard "${hazard.id}" is out of bounds`);
    }
  }

  arena.spawns.forEach((spawn, index) => {
    const box = { x: spawn.x, y: spawn.y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
    if (!containsBox(arena.bounds, box)) {
      issues.push(`spawn ${index} is out of bounds`);
    }
    if (allSolids.some((solid) => overlaps(box, solid))) {
      issues.push(`spawn ${index} overlaps a solid`);
    }
    if (!hasGroundBelow(box, arena, initialHazardState)) {
      issues.push(`spawn ${index} has no ground reachable by gravity`);
    }
  });

  const hasKillZone = arena.killZones.length > 0 || arena.hazards.some((h) => h.kind === "killZone");
  const hasFloor = arena.solids.length > 0;
  if (!hasKillZone && !hasFloor) {
    issues.push("arena has neither a kill zone nor a solid floor");
  }

  return { valid: issues.length === 0, issues };
}
