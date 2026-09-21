// @vitest-environment node
import { readFileSync } from "node:fs";
import { POWER_UP_POOL } from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import {
  POWERUP_ICON_COLUMNS,
  POWERUP_ICON_ORDER,
  POWERUP_ICON_TILE,
  describePowerUp,
  powerUpCard,
  powerUpIconTile,
  powerUpName,
} from "./powerups.js";

const def = (id: string) => POWER_UP_POOL.find((d) => d.id === id)!;

describe("power-up names", () => {
  it("names every power-up explicitly, so a new one cannot ship as a bare id", () => {
    for (const { id } of POWER_UP_POOL) {
      // A fallback would turn "swiftBoots" into "Swift Boots" too; the table entry is what is required.
      expect(powerUpName(id), id).not.toBe(id);
      expect(powerUpCard(id).name, id).toMatch(/^[A-Z]/);
    }
    expect(new Set(POWER_UP_POOL.map(({ id }) => powerUpName(id))).size).toBe(POWER_UP_POOL.length);
  });

  it("makes words of an id nobody has named yet", () => {
    expect(powerUpName("moonlitCloak")).toBe("Moonlit Cloak");
  });
});

describe("describePowerUp", () => {
  it("words each kind of modifier with its sign and unit", () => {
    expect(describePowerUp(def("swiftBoots"))).toEqual(["+16 move speed"]);
    expect(describePowerUp(def("stoneSkin"))).toEqual(["+12 max HP"]);
    expect(describePowerUp(def("secondWind"))).toEqual(["+0.2 stamina regained per tick"]);
    expect(describePowerUp(def("quickHands"))).toEqual(["+6% attack speed"]);
    expect(describePowerUp(def("berserkersRage"))).toEqual(["+15% attack speed"]);
    expect(describePowerUp(def("steadyGuard"))).toEqual(["-10% block stamina cost"]);
    expect(describePowerUp(def("bracedStance"))).toEqual(["+5% knockback resistance"]);
    expect(describePowerUp(def("evasiveRoll"))).toEqual(["+1 tick of roll invulnerability"]);
  });

  it("words each effect", () => {
    expect(describePowerUp(def("vampiricEdge"))).toEqual(["Heal 10% of the damage you deal"]);
    expect(describePowerUp(def("spikedArmor"))).toEqual(["Reflect 12% of the damage you take"]);
    expect(describePowerUp(def("aerialistBoots"))).toEqual(["Jump once more in mid-air"]);
    expect(describePowerUp(def("emberWard"))).toEqual(["Immune to fire"]);
    expect(describePowerUp(def("guardianCharm"))).toEqual(["Survive one fall into a kill zone"]);
  });

  it("says something for every power-up, one line per modifier and effect", () => {
    for (const power of POWER_UP_POOL) {
      const lines = describePowerUp(power);
      expect(lines, power.id).toHaveLength(power.modifiers.length + (power.effects?.length ?? 0));
      expect(lines.length, power.id).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line, power.id).not.toMatch(/NaN|undefined|Infinity/);
      }
    }
  });
});

describe("powerUpCard", () => {
  it("carries the rarity and how far it stacks", () => {
    expect(powerUpCard("swiftBoots")).toMatchObject({
      rarity: "common",
      stacks: "Stacks up to ×5",
    });
    expect(powerUpCard("aerialistBoots")).toMatchObject({
      rarity: "epic",
      stacks: "One per match",
    });
  });

  it("still gives an unknown id a card", () => {
    expect(powerUpCard("moonlitCloak")).toEqual({
      id: "moonlitCloak",
      name: "Moonlit Cloak",
      rarity: null,
      lines: [],
      stacks: "",
    });
  });
});

describe("power-up icons", () => {
  const sheet = new URL("../../public/assets/ui/powerups.png", import.meta.url);
  const script = readFileSync(
    new URL("../../../../art/ui/build_icons.py", import.meta.url),
    "utf8",
  );

  it("has a tile for every power-up", () => {
    for (const { id } of POWER_UP_POOL) {
      expect(powerUpIconTile(id), id).toBeDefined();
    }
    expect(powerUpIconTile("moonlitCloak")).toBeUndefined();
    expect(new Set(POWERUP_ICON_ORDER).size).toBe(POWERUP_ICON_ORDER.length);
  });

  it("is the order art/ui/build_icons.py draws them in", () => {
    const drawn = [
      ...script.slice(script.indexOf("ICONS = {")).matchAll(/\n {4}"(\w+)": [[{]/g),
    ].map((m) => m[1]);
    expect(POWERUP_ICON_ORDER).toEqual(drawn);
  });

  it("puts each tile inside a sheet of the size the script writes", () => {
    const png = readFileSync(sheet);
    const rows = Math.ceil(POWERUP_ICON_ORDER.length / POWERUP_ICON_COLUMNS);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
      POWERUP_ICON_COLUMNS * POWERUP_ICON_TILE,
      rows * POWERUP_ICON_TILE,
    ]);
  });
});
