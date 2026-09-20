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
    const powerups = p.powerups ?? {};
    const powerupIds = (Object.keys(powerups) as (keyof typeof powerups)[]).sort();
    const powerupStacks = powerupIds
      .map((powerupId) => `${powerupId}:${powerups[powerupId]}`)
      .join("|");
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
      p.weapon,
      p.action,
      p.actionTick,
      p.attackKind ?? "",
      p.hp,
      p.stamina,
      p.hitstunTicks,
      p.invulnTicks,
      p.hitConfirmTicks,
      p.comboCount,
      p.lastHitBy ?? "",
      p.lastHitTick,
      powerupStacks,
      p.airJumpsUsed ?? 0,
      p.ringOutArmorChargesUsed ?? 0,
    ].join(",");
  });
  const hazardState = state.hazards ?? {};
  const hazardIds = Object.keys(hazardState).sort();
  const hazards = hazardIds.map((id) => {
    const h = hazardState[id]!;
    return [id, h.kind, h.active ? 1 : 0, h.hp, h.phase, h.timer].join(",");
  });

  // Only when set, so a state that never entered sudden death hashes exactly as it always did.
  const suddenDeath = state.suddenDeathTicks ? [`sd:${state.suddenDeathTicks}`] : [];
  return fnv1a([state.tick, state.rngSeed, ...players, ...hazards, ...suddenDeath].join(";"));
}
