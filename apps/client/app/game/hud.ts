import type { MatchState } from "@castle-clash/shared";

export interface HudPlayerSnapshot {
  id: string;
  /** Display name from the server; empty only when talking to an older server. */
  name: string;
  isLocal: boolean;
  /** A server-driven seat: always labelled as one in the UI. */
  isBot: boolean;
  hp: number;
  stamina: number;
  weapon: string;
  action: string;
  /** Which attack is in flight ("light", "heavy", "airLight"), "" otherwise. */
  attackKind: string;
  /** Ticks left of a drop-through (DOWN+JUMP); 0 when not dropping. */
  dropThroughTicks: number;
  grounded: boolean;
  y: number;
  /** Owned power-up ids, one entry per stack (plan Phase 7) — public on the
   *  wire (`PlayerState.powerups`), so opponents' builds show here too. */
  powerups: string[];
}

/**
 * Pure `MatchState -> HudPlayerSnapshot[]` mapping, the combat-HUD
 * equivalent of `viewmodel/playersToRects.ts` — `GameClient` calls this once
 * per `onStateChange` (already throttled to `PATCH_RATE`, so this doubles as
 * the HUD's own throttle) and hands the result to React. Local player
 * sorted first so "You" stays in a stable position on screen.
 */
export function matchStateToHud(state: MatchState, localId: string | null): HudPlayerSnapshot[] {
  const snapshots: HudPlayerSnapshot[] = [];
  state.players.forEach((player) => {
    snapshots.push({
      id: player.id,
      name: player.name,
      isLocal: player.id === localId,
      isBot: player.isBot,
      hp: player.hp,
      stamina: player.stamina,
      weapon: player.weapon,
      action: player.action,
      attackKind: player.attackKind,
      dropThroughTicks: player.dropThroughTicks,
      grounded: player.grounded,
      y: player.y,
      powerups: player.powerups.toArray(),
    });
  });
  return snapshots.sort((a, b) => Number(b.isLocal) - Number(a.isLocal));
}
