import { beforeAll, describe, expect, it } from "vitest";
import { WEAPON_IDS } from "../types/ids.js";
import {
  formatBalanceCsv,
  formatBalanceMarkdown,
  runBalanceMatch,
  runBalanceSimulation,
  type BalanceSummary,
} from "./balance.js";

// A full match is a few thousand `GameSimulation.step()` ticks — slow enough
// (relative to this repo's other unit tests) that this file gets its own
// generous per-test timeout, and `runBalanceSimulation` is computed ONCE in
// `beforeAll` and shared across the describe block below rather than
// re-run per assertion.
const MATCH_TEST_TIMEOUT_MS = 20_000;
const SAMPLE_MATCH_COUNT = 6;

describe("runBalanceMatch", () => {
  it(
    "finishes a match deterministically given the same seed",
    () => {
      const a = runBalanceMatch(1, WEAPON_IDS.SWORD, WEAPON_IDS.MACE);
      const b = runBalanceMatch(1, WEAPON_IDS.SWORD, WEAPON_IDS.MACE);
      expect(a).not.toBeNull();
      expect(a).toEqual(b);
    },
    MATCH_TEST_TIMEOUT_MS,
  );

  it(
    "returns a winner/loser weapon pair and non-empty power-up builds for a real match",
    () => {
      const result = runBalanceMatch(7, WEAPON_IDS.SWORD, WEAPON_IDS.SPEAR);
      expect(result).not.toBeNull();
      expect([WEAPON_IDS.SWORD, WEAPON_IDS.SPEAR]).toContain(result!.winnerWeapon);
      expect([WEAPON_IDS.SWORD, WEAPON_IDS.SPEAR]).toContain(result!.loserWeapon);
      // ROUNDS_TO_WIN rounds each draft once -> the winner picked at least once.
      expect(result!.winnerPowerups.length).toBeGreaterThan(0);
    },
    MATCH_TEST_TIMEOUT_MS,
  );
});

describe("runBalanceSimulation", () => {
  let summary: BalanceSummary;

  beforeAll(() => {
    summary = runBalanceSimulation(123, SAMPLE_MATCH_COUNT);
  }, MATCH_TEST_TIMEOUT_MS);

  it("tallies wins/appearances across a small deterministic batch", () => {
    expect(summary.matches + summary.unfinished).toBe(SAMPLE_MATCH_COUNT);
    if (summary.matches > 0) {
      const totalAppearances = Object.values(summary.appearancesByWeapon).reduce(
        (sum, n) => sum + (n ?? 0),
        0,
      );
      expect(totalAppearances).toBe(summary.matches * 2);
    }
  });

  it("formats a markdown report with weapon and power-up sections", () => {
    const markdown = formatBalanceMarkdown(summary);
    expect(markdown).toContain("# Power-up / weapon balance report");
    expect(markdown).toContain("Win rate by weapon");
    expect(markdown).toContain("Win rate by power-up");
  });

  it("formats a CSV report with a header and one row per weapon/power-up", () => {
    const csv = formatBalanceCsv(summary);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("kind,id,appearances,wins,winRate");
    const weaponRows = Object.keys(summary.appearancesByWeapon).length;
    const powerUpRows = Object.keys(summary.appearancesByPowerUp).length;
    expect(lines.length).toBe(1 + weaponRows + powerUpRows);
  });
});
