import type { MatchState } from "@castle-clash/shared";

export interface HudPlayerSnapshot {
  id: string;
  isLocal: boolean;
  hp: number;
  stamina: number;
  weapon: string;
  action: string;
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
      isLocal: player.id === localId,
      hp: player.hp,
      stamina: player.stamina,
      weapon: player.weapon,
      action: player.action,
    });
  });
  return snapshots.sort((a, b) => Number(b.isLocal) - Number(a.isLocal));
}
