import type { SimState } from "../sim/types.js";

export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** FNV-1a over a canonical serialization of `state` — players sorted by id so
 *  hashing is independent of `Object.keys` iteration order. */
export function hashState(state: SimState): number {
  const ids = Object.keys(state.players).sort();
  const players = ids.map((id) => {
    const p = state.players[id as keyof typeof state.players]!;
    return [
      id,
      p.pos.x,
      p.pos.y,
      p.vel.x,
      p.vel.y,
      p.facing,
      p.grounded ? 1 : 0,
      p.coyoteTicks,
      p.jumpBufferTicks,
      p.dropThroughTicks,
      p.lastInputSeq,
    ].join(",");
  });
  return fnv1a([state.tick, state.rngSeed, ...players].join(";"));
}
