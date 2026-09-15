import type { MatchState, Vec } from "@castle-clash/shared";

export interface PlayerRect {
  id: string;
  x: number;
  y: number;
  tint: number;
  /** The player's current combat `ActionState` (a plain string here, not
   *  the shared union type — this stays a pure mapping and leaves deciding
   *  what each state looks like to the render layer). */
  action: string;
}

const RGB_MASK = 0xffffff;

/**
 * Maps server state to render rects, defaulting each player's position to
 * its raw schema `x`/`y`. `positionOverrides` lets `GameClient` substitute a
 * smoother position per player — the local player's reconciled/predicted
 * position, or a remote player's interpolated one — without this pure
 * mapping needing to know about prediction or interpolation at all.
 */
export function playersToRects(
  state: MatchState,
  positionOverrides: Readonly<Partial<Record<string, Vec>>> = {},
): PlayerRect[] {
  const rects: PlayerRect[] = [];
  state.players.forEach((player) => {
    const pos = positionOverrides[player.id] ?? player;
    rects.push({
      id: player.id,
      x: pos.x,
      y: pos.y,
      tint: player.colorSeed & RGB_MASK,
      action: player.action,
    });
  });
  return rects;
}
