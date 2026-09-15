import { describe, expect, it } from "vitest";
import { WEAPON_IDS } from "../types/ids.js";
import { getAttack, hitboxWorldBox, WEAPONS } from "./weapons.js";

const ALL_WEAPONS = Object.values(WEAPONS);
const ALL_ATTACKS = ALL_WEAPONS.flatMap((weapon) => [
  { weapon, kind: "light" as const, attack: weapon.light },
  { weapon, kind: "heavy" as const, attack: weapon.heavy },
  { weapon, kind: "airLight" as const, attack: weapon.airLight },
]);

describe("weapons", () => {
  it.each(ALL_ATTACKS)("$weapon.id $kind has startup/active/recovery >= 1", ({ attack }) => {
    expect(attack.startup).toBeGreaterThanOrEqual(1);
    expect(attack.active).toBeGreaterThanOrEqual(1);
    expect(attack.recovery).toBeGreaterThanOrEqual(1);
  });

  it.each(ALL_ATTACKS)("$weapon.id $kind hitboxes only appear during active ticks", ({ attack }) => {
    expect(attack.hitboxes.length).toBeGreaterThan(0);
    for (const hitbox of attack.hitboxes) {
      expect(hitbox.tickOffset).toBeGreaterThanOrEqual(0);
      expect(hitbox.tickOffset).toBeLessThan(attack.active);
    }
  });

  it("orders reach as Spear > Sword > Mace", () => {
    expect(WEAPONS[WEAPON_IDS.SPEAR]!.reach).toBeGreaterThan(WEAPONS[WEAPON_IDS.SWORD]!.reach);
    expect(WEAPONS[WEAPON_IDS.SWORD]!.reach).toBeGreaterThan(WEAPONS[WEAPON_IDS.MACE]!.reach);
  });

  it("getAttack returns light, heavy, or airLight by kind", () => {
    const sword = WEAPONS[WEAPON_IDS.SWORD]!;
    expect(getAttack(sword, "light")).toBe(sword.light);
    expect(getAttack(sword, "heavy")).toBe(sword.heavy);
    expect(getAttack(sword, "airLight")).toBe(sword.airLight);
  });

  it.each(ALL_WEAPONS)(
    "$id's airLight has its own frame data distinct from its grounded light",
    (weapon) => {
      expect(weapon.airLight).not.toEqual(weapon.light);
      expect(weapon.airLight.recovery).toBeLessThan(weapon.light.recovery);
    },
  );

  describe("hitboxWorldBox", () => {
    it("places the box in front of the player when facing right", () => {
      const box = hitboxWorldBox({ x: 100, y: 200 }, 1, { x: 28, y: 0, w: 70, h: 48 });
      expect(box).toEqual({ x: 128, y: 200, w: 70, h: 48 });
    });

    it("mirrors the box in front of the player when facing left", () => {
      const box = hitboxWorldBox({ x: 100, y: 200 }, -1, { x: 28, y: 0, w: 70, h: 48 });
      expect(box).toEqual({ x: 100 - 28 - 70, y: 200, w: 70, h: 48 });
    });
  });
});
