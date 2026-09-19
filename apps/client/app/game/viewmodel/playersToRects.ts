import { getCosmeticTint, type MatchState, type Vec } from "@castle-clash/shared";

export interface PlayerRect {
  id: string;
  x: number;
  y: number;
  tint: number;
  /** The player's current combat `ActionState` (a plain string here, not
   *  the shared union type — this stays a pure mapping and leaves deciding
   *  what each state looks like to the render layer). */
  action: string;
  /** The equipped helmet/cape's render color (plan Phase 9 step 3:
   *  "server-validated cosmetics visible to all players"), or `undefined`
   *  when that slot's equipped item is that slot's `default` (draw
   *  nothing) or an id `getCosmeticTint` doesn't recognize. `render/
   *  PlayerRects.ts` draws each as a small indicator rect over the body —
   *  see `docs/research/phase9-cosmetics-rendering-deviation.md` for why
   *  this is a tint, not a texture. */
  helmetTint?: number;
  capeTint?: number;
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
      helmetTint: getCosmeticTint(player.cosmetics.helmetId),
      capeTint: getCosmeticTint(player.cosmetics.capeId),
    });
  });
  return rects;
}
