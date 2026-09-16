import type { MatchResultRecord, PlayerRepository } from "./PlayerRepository.js";

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 200;

/** This codebase has no metrics client anywhere else (checked: no
 *  prometheus/statsd dependency exists) — an exported counter is the
 *  simplest honest way to satisfy plan step 5's "failures are ... exported
 *  as a metric" without inventing infrastructure the rest of the server
 *  doesn't use. Wiring this to a real metrics backend is future work. */
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
 * `MatchRoom` deliberately ignores it (fire-and-forget).
 */
export function enqueueRecordMatch(
  repo: PlayerRepository,
  result: MatchResultRecord,
  delayFn: (ms: number) => Promise<void> = delay,
): Promise<void> {
  return attempt(repo, result, 1, delayFn);
}

async function attempt(
  repo: PlayerRepository,
  result: MatchResultRecord,
  attemptNumber: number,
  delayFn: (ms: number) => Promise<void>,
): Promise<void> {
  try {
    await repo.recordMatch(result);
  } catch (error) {
    if (attemptNumber >= MAX_ATTEMPTS) {
      recordMatchFailureCount.value += 1;
      console.error(`[recordMatch] giving up after ${attemptNumber} attempts for match ${result.matchId}:`, error);
      return;
    }
    const backoffMs = BASE_DELAY_MS * 2 ** (attemptNumber - 1);
    console.warn(
      `[recordMatch] attempt ${attemptNumber} failed for match ${result.matchId}, retrying in ${backoffMs}ms:`,
      error,
    );
    await delayFn(backoffMs);
    await attempt(repo, result, attemptNumber + 1, delayFn);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
