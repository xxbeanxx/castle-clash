import type { MatchState } from "@castle-clash/shared";

/** What the solo-play UI needs to know about the room, apart from the phase banner. */
export interface RoomInfoSnapshot {
  /** "quick", "private" or "practice". */
  mode: string;
  /** The server is offering the lone player a bot (decision D4: offered, never automatic). */
  backfillOfferable: boolean;
  /** The local player already asked for a rematch and is waiting for the others. */
  wantsRematch: boolean;
  /** Humans and bots seated, spectators excluded. */
  humans: number;
  botIds: string[];
}

/** Pure `MatchState -> RoomInfoSnapshot`, pushed from the same throttled `onStateChange` as the HUD. */
export function matchStateToRoomInfo(state: MatchState, localId: string | null): RoomInfoSnapshot {
  let humans = 0;
  let wantsRematch = false;
  const botIds: string[] = [];
  state.players.forEach((player) => {
    if (player.isBot) {
      botIds.push(player.id);
      return;
    }
    if (!player.spectator) {
      humans += 1;
    }
    if (player.id === localId) {
      wantsRematch = player.wantsRematch;
    }
  });
  return {
    mode: state.mode,
    backfillOfferable: state.backfillOfferable,
    wantsRematch,
    humans,
    botIds,
  };
}
