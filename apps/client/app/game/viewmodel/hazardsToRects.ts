import type { HazardDef, MatchState } from "@castle-clash/shared";

export interface HazardRect {
  id: string;
  /** A plain string here, not `HazardKind` — same convention as
   *  `playersToRects`'s `PlayerRect.action` (a plain string, not
   *  `ActionState`): this stays a pure mapping and leaves deciding what
   *  each kind looks like to the render layer (`HazardView`). */
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  active: boolean;
  phase: string;
  /** Synced hit points, and the def's starting value (0 for a kind with none), so a breakable
   *  floor can show how damaged it is. */
  hp: number;
  maxHp: number;
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
  const defById = new Map(defs.map((def) => [def.id, def]));
  const rects: HazardRect[] = [];

  state.hazards.forEach((hazard, id) => {
    const def = defById.get(id);
    if (!def) {
      return;
    }
    const box = def.box;
    rects.push({
      id,
      kind: hazard.kind,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      active: hazard.active,
      phase: hazard.phase,
      hp: hazard.hp,
      maxHp: def.kind === "breakableFloor" ? def.hp : 0,
    });
  });

  return rects;
}
