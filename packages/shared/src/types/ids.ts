declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type PlayerId = Brand<string, "PlayerId">;
export type RoomId = Brand<string, "RoomId">;

export function playerId(raw: string): PlayerId {
  return raw as PlayerId;
}

export function roomId(raw: string): RoomId {
  return raw as RoomId;
}

export const WEAPON_IDS = {
  SWORD: "sword",
  MACE: "mace",
  SPEAR: "spear",
} as const;

export type WeaponId = (typeof WEAPON_IDS)[keyof typeof WEAPON_IDS];

export function isWeaponId(value: string): value is WeaponId {
  return (Object.values(WEAPON_IDS) as string[]).includes(value);
}

export const ARENA_IDS = {
  PIT: "pit",
  CASTLE_ROOM: "castleRoom",
  COLOSSEUM: "colosseum",
  BRIDGE: "bridge",
  WOODEN_HALL: "woodenHall",
  DUNGEON: "dungeon",
} as const;

export type ArenaId = (typeof ARENA_IDS)[keyof typeof ARENA_IDS];

export function isArenaId(value: string): value is ArenaId {
  return (Object.values(ARENA_IDS) as string[]).includes(value);
}
