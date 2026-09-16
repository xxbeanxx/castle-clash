import type { HazardDef, MatchState } from "@castle-clash/shared";

export interface HazardRect {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  active: boolean;
  phase: string;
}

/**
 * Maps synced `HazardState` entries to render rects — box geometry comes
 * from `defs` (the arena's static `HazardDef`s, loaded locally by
 * `arenaId`), never from the wire (plan step 5: static geometry is never
 * sent). A synced hazard id with no matching def is skipped, the same
 * "server and client both agree on what exists, don't invent it here"
 * contract `playersToRects` follows for players.
 */
export function hazardsToRects(state: MatchState, defs: readonly HazardDef[]): HazardRect[] {
  const boxById = new Map(defs.map((def) => [def.id, def.box]));
  const rects: HazardRect[] = [];

  state.hazards.forEach((hazard, id) => {
    const box = boxById.get(id);
    if (!box) {
      return;
    }
    rects.push({
      id,
      kind: hazard.kind,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      active: hazard.active,
      phase: hazard.phase,
    });
  });

  return rects;
}
