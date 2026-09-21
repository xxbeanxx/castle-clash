import { getCosmeticTint, type MatchState, type SimPlayer, type Vec } from "@castle-clash/shared";

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

/** A `PlayerRect` plus what `knightAnimation.ts` needs to pick a clip and frame, and which way the
 *  knight faces. Only `KnightView` reads the extra fields. */
export interface KnightRect extends PlayerRect {
  actionTick: number;
  attackKind: string;
  weapon: string;
  facing: 1 | -1;
  vy: number;
  /** What the name plate says (`PlayerState.name`; empty until the server has sent it). */
  name: string;
  /** Whether this is the player looking at the screen, which gets the arrow over its plate. Known
   *  only once prediction is seeded, so it is briefly false for the local knight. */
  isLocal: boolean;
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
  /** The local player's predicted sim state. Its combat fields replace the schema's, which trail
   *  the input by a round trip, so the local knight swings on the frame the key is pressed. */
  predicted?: { id: string; player: SimPlayer },
): KnightRect[] {
  const rects: KnightRect[] = [];
  state.players.forEach((player) => {
    const pos = positionOverrides[player.id] ?? player;
    const own = predicted?.id === player.id ? predicted.player : undefined;
    rects.push({
      id: player.id,
      x: pos.x,
      y: pos.y,
      tint: player.colorSeed & RGB_MASK,
      action: own?.action ?? player.action,
      actionTick: own?.actionTick ?? player.actionTick,
      attackKind: own ? (own.attackKind ?? "") : player.attackKind,
      weapon: own?.weapon ?? player.weapon,
      facing: own?.facing ?? (player.facing < 0 ? -1 : 1),
      vy: own?.vel.y ?? player.vy,
      name: player.name,
      isLocal: own !== undefined,
      helmetTint: getCosmeticTint(player.cosmetics.helmetId),
      capeTint: getCosmeticTint(player.cosmetics.capeId),
    });
  });
  return rects;
}
