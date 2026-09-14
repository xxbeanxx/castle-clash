import type { MatchState } from "@castle-clash/shared";

export interface PlayerRect {
  id: string;
  x: number;
  y: number;
  tint: number;
}

const RGB_MASK = 0xffffff;

export function playersToRects(state: MatchState): PlayerRect[] {
  const rects: PlayerRect[] = [];
  state.players.forEach((player) => {
    rects.push({ id: player.id, x: player.x, y: player.y, tint: player.colorSeed & RGB_MASK });
  });
  return rects;
}
