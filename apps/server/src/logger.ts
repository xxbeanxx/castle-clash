import pino from "pino";

/**
 * Plan Phase 10 step 1: "Structured logs with pino (roomId, matchId,
 * userId)." A single root logger, JSON-structured (no `pino-pretty`
 * dependency — this is meant for a log aggregator, not a human terminal);
 * `LOG_LEVEL` defaults to `info` and is the one env var this module reads.
 * `MatchRoom`/`RecordMatchQueue`/persistence code call `.child({...})` off
 * this to attach `roomId`/`matchId`/`userId` context per call site, rather
 * than each one constructing its own pino instance.
 *
 * Defaults to `silent` under Vitest (`NODE_ENV === "test"`, the same check
 * `index.ts`'s `greet` option already relies on) unless `LOG_LEVEL` is set
 * explicitly — several existing tests deliberately exercise the retry/
 * rate-limit/malformed-input paths that log at `warn`/`error`, and their
 * JSON output was drowning out `vitest`'s own pass/fail summary.
 */
const defaultLevel = process.env.NODE_ENV === "test" ? "silent" : "info";
export const logger = pino({ level: process.env.LOG_LEVEL ?? defaultLevel });
