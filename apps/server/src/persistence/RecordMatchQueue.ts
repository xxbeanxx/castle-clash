import { logger } from "../logger.js";
import type { MatchResultRecord, PlayerRepository } from "./PlayerRepository.js";

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 200;

/** Plan Phase 8 step 5's "failures are ... exported as a metric" — this
 *  plain counter is what `RecordMatchQueue.test.ts` asserts against
 *  directly; `observability/metrics.ts`'s `record_match_failures_total`
 *  Gauge (Phase 10) reads it via a `collect()` callback rather than this
 *  file also incrementing a `prom-client` counter in parallel, so there's
 *  exactly one source of truth for the count. */
export const recordMatchFailureCount = { value: 0 };

/**
 * Retry-with-backoff wrapper around `PlayerRepository.recordMatch` (plan
 * Phase 8 step 5). `MatchRoom` calls this once per completed match and
 * never awaits it — a transient Supabase failure retried in the background
 * must never delay or crash the room's own lifecycle (`onDispose` runs
 * regardless). Safe to retry blindly because `recordMatch` is idempotent on
 * `result.matchId` in both `PlayerRepository` implementations.
 *
 * Returns the retry chain's promise so tests can await determinism;
 * resolves `true` if `recordMatch` ever succeeded, `false` if every attempt
 * was exhausted — `MatchRoom` uses that to decide whether running
 * `evaluateAndGrantUnlocks` afterward (plan Phase 9 step 3) is worthwhile at
 * all: unlock evaluation reads stats `recordMatch` itself would have just
 * written, so it would find nothing new if that write never landed.
 */
export function enqueueRecordMatch(
  repo: PlayerRepository,
  result: MatchResultRecord,
  delayFn: (ms: number) => Promise<void> = delay,
): Promise<boolean> {
  return attempt(repo, result, 1, delayFn);
}

async function attempt(
  repo: PlayerRepository,
  result: MatchResultRecord,
  attemptNumber: number,
  delayFn: (ms: number) => Promise<void>,
): Promise<boolean> {
  try {
    await repo.recordMatch(result);
    return true;
  } catch (error) {
    if (attemptNumber >= MAX_ATTEMPTS) {
      recordMatchFailureCount.value += 1;
      logger.error(
        { err: error, matchId: result.matchId, attemptNumber },
        "recordMatch: giving up after max attempts",
      );
      return false;
    }
    const backoffMs = BASE_DELAY_MS * 2 ** (attemptNumber - 1);
    logger.warn(
      { err: error, matchId: result.matchId, attemptNumber, backoffMs },
      "recordMatch: attempt failed, retrying",
    );
    await delayFn(backoffMs);
    return attempt(repo, result, attemptNumber + 1, delayFn);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
