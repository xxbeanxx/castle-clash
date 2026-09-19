import { mkdirSync, writeFileSync } from "node:fs";
import { formatBalanceCsv, formatBalanceMarkdown, runBalanceSimulation } from "../src/testing/balance.js";

/**
 * CI/CD's `balance-report` job entry point (plan Phase 7): runs thousands of
 * bot matches with random weapon match-ups and drafts, then writes a
 * Markdown + CSV summary for `actions/upload-artifact` to pick up.
 * `pnpm --filter @castle-clash/shared run sim:balance`. Nothing in `ci.yaml`
 * blocks on this — it tracks trends for tuning, per the plan.
 */
const MATCH_COUNT = Number(process.env.SIM_BALANCE_MATCHES ?? 2000);
const SEED = Number(process.env.SIM_BALANCE_SEED ?? Date.now());
const OUT_DIR = "balance-report";

const summary = runBalanceSimulation(SEED, MATCH_COUNT);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/report.md`, formatBalanceMarkdown(summary));
writeFileSync(`${OUT_DIR}/report.csv`, formatBalanceCsv(summary));

console.log(
  `sim:balance: ${summary.matches} finished matches (${summary.unfinished} excluded), seed=${SEED} -> ${OUT_DIR}/report.{md,csv}`,
);
