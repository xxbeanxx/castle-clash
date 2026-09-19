import { WEAPON_IDS, WEAPONS, type WeaponDef, type WeaponId } from "@castle-clash/shared";

export const WEAPON_LABELS: Record<WeaponId, string> = {
  [WEAPON_IDS.SWORD]: "Sword",
  [WEAPON_IDS.MACE]: "Mace",
  [WEAPON_IDS.SPEAR]: "Spear",
};

/**
 * One-line character of each weapon. The claims are checked against the frame
 * data in `weapons.test.ts`, so a balance change that makes one untrue fails a
 * test instead of quietly misleading the landing page.
 */
export const WEAPON_TRAITS: Record<WeaponId, string> = {
  [WEAPON_IDS.SWORD]: "Quick and balanced. Chains two light strikes.",
  [WEAPON_IDS.MACE]: "Slow and crushing. Its heavy blow shatters a guard.",
  [WEAPON_IDS.SPEAR]: "Longest reach. Keep foes at the tip.",
};

export interface WeaponFacts {
  readonly id: WeaponId;
  readonly label: string;
  readonly trait: string;
  readonly def: WeaponDef;
}

export function weaponFacts(): WeaponFacts[] {
  return (Object.values(WEAPON_IDS) as WeaponId[]).map((id) => ({
    id,
    label: WEAPON_LABELS[id],
    trait: WEAPON_TRAITS[id],
    def: WEAPONS[id],
  }));
}
