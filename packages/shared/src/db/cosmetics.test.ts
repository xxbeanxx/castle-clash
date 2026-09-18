import { describe, expect, it } from "vitest";
import { WEAPON_IDS } from "../types/ids.js";
import {
  COSMETIC_CATALOG,
  COSMETIC_SLOTS,
  evaluateUnlocks,
  getCosmeticTint,
  resolveCosmeticSelection,
  type UnlockStats,
} from "./cosmetics.js";

const ZERO_STATS: UnlockStats = {
  wins: 0,
  eliminations: 0,
  matchesPlayed: 0,
  winsByWeapon: {},
};

describe("COSMETIC_CATALOG", () => {
  it("has unique ids", () => {
    const ids = COSMETIC_CATALOG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has a default item for every slot", () => {
    for (const slot of Object.values(COSMETIC_SLOTS)) {
      const defaults = COSMETIC_CATALOG.filter(
        (item) => item.slot === slot && item.unlock.type === "default",
      );
      expect(defaults.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("gives every non-default item a tint so it renders distinctly without sprite art", () => {
    for (const item of COSMETIC_CATALOG) {
      if (item.unlock.type !== "default") {
        expect(item.tint).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("evaluateUnlocks", () => {
  it("never emits a default-unlock item", () => {
    expect(evaluateUnlocks(ZERO_STATS, [])).not.toContain(
      COSMETIC_CATALOG.find((item) => item.unlock.type === "default")?.id,
    );
  });

  it("does not unlock a wins-gated item at n-1 wins but does at n wins", () => {
    const item = COSMETIC_CATALOG.find((i) => i.unlock.type === "wins")!;
    const n = item.unlock.type === "wins" ? item.unlock.n : 0;

    expect(evaluateUnlocks({ ...ZERO_STATS, wins: n - 1 }, [])).not.toContain(item.id);
    expect(evaluateUnlocks({ ...ZERO_STATS, wins: n }, [])).toContain(item.id);
  });

  it("does not re-emit an already-owned item even once its threshold is met", () => {
    const item = COSMETIC_CATALOG.find((i) => i.unlock.type === "wins")!;
    const n = item.unlock.type === "wins" ? item.unlock.n : 0;

    expect(evaluateUnlocks({ ...ZERO_STATS, wins: n }, [item.id])).not.toContain(item.id);
  });

  it("counts eliminations-gated items against eliminations only", () => {
    const item = COSMETIC_CATALOG.find((i) => i.unlock.type === "eliminations")!;
    const n = item.unlock.type === "eliminations" ? item.unlock.n : 0;

    expect(evaluateUnlocks({ ...ZERO_STATS, wins: 999, eliminations: n - 1 }, [])).not.toContain(
      item.id,
    );
    expect(evaluateUnlocks({ ...ZERO_STATS, eliminations: n }, [])).toContain(item.id);
  });

  it("counts matchesPlayed-gated items against matchesPlayed only", () => {
    const item = COSMETIC_CATALOG.find((i) => i.unlock.type === "matchesPlayed")!;
    const n = item.unlock.type === "matchesPlayed" ? item.unlock.n : 0;

    expect(evaluateUnlocks({ ...ZERO_STATS, wins: 999, matchesPlayed: n - 1 }, [])).not.toContain(
      item.id,
    );
    expect(evaluateUnlocks({ ...ZERO_STATS, matchesPlayed: n }, [])).toContain(item.id);
  });

  it("counts winWithWeapon items only against wins with that exact weapon", () => {
    const item = COSMETIC_CATALOG.find(
      (i) => i.unlock.type === "winWithWeapon" && i.unlock.weapon === WEAPON_IDS.SWORD,
    )!;
    const n = item.unlock.type === "winWithWeapon" ? item.unlock.n : 0;

    const wrongWeapon: UnlockStats = { ...ZERO_STATS, winsByWeapon: { [WEAPON_IDS.MACE]: n + 5 } };
    expect(evaluateUnlocks(wrongWeapon, [])).not.toContain(item.id);

    const rightWeapon: UnlockStats = { ...ZERO_STATS, winsByWeapon: { [WEAPON_IDS.SWORD]: n } };
    expect(evaluateUnlocks(rightWeapon, [])).toContain(item.id);
  });

  it("can return multiple newly unlocked items in one evaluation", () => {
    const bigStats: UnlockStats = {
      wins: 9999,
      eliminations: 9999,
      matchesPlayed: 9999,
      winsByWeapon: {
        [WEAPON_IDS.SWORD]: 9999,
        [WEAPON_IDS.MACE]: 9999,
        [WEAPON_IDS.SPEAR]: 9999,
      },
    };
    const nonDefaultCount = COSMETIC_CATALOG.filter(
      (item) => item.unlock.type !== "default",
    ).length;
    expect(evaluateUnlocks(bigStats, [])).toHaveLength(nonDefaultCount);
  });
});

describe("getCosmeticTint", () => {
  it("returns undefined for a default item", () => {
    expect(getCosmeticTint("helmet-none")).toBeUndefined();
  });

  it("returns undefined for an unknown id", () => {
    expect(getCosmeticTint("not-a-real-item")).toBeUndefined();
  });

  it("returns the catalog tint for a non-default item", () => {
    expect(getCosmeticTint("helmet-gold")).toBe(0xffd700);
  });
});

describe("resolveCosmeticSelection", () => {
  it("resolves a null selection to the slot's default item", () => {
    expect(resolveCosmeticSelection(COSMETIC_SLOTS.HELMET, null, [])).toBe("helmet-none");
  });

  it("resolves an unowned selection to the slot's default item", () => {
    expect(resolveCosmeticSelection(COSMETIC_SLOTS.HELMET, "helmet-gold", [])).toBe("helmet-none");
  });

  it("resolves an owned selection to itself", () => {
    expect(resolveCosmeticSelection(COSMETIC_SLOTS.HELMET, "helmet-gold", ["helmet-gold"])).toBe(
      "helmet-gold",
    );
  });

  it("resolves an id from the wrong slot to the requested slot's default", () => {
    expect(resolveCosmeticSelection(COSMETIC_SLOTS.HELMET, "cape-royal", ["cape-royal"])).toBe(
      "helmet-none",
    );
  });

  it("resolves an unknown id to the slot's default", () => {
    expect(resolveCosmeticSelection(COSMETIC_SLOTS.CAPE, "not-a-real-item", [])).toBe("cape-none");
  });
});
