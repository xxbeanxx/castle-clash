import { evaluateUnlocks } from "@castle-clash/shared";
import type { PlayerRepository } from "../persistence/PlayerRepository.js";

/**
 * Runs `evaluateUnlocks()` (shared, pure) against each participant's
 * freshly-updated stats and grants whatever comes back through the
 * repository (plan Phase 9 step 3: "After recordMatch succeeds, the server
 * runs evaluateUnlocks and inserts new unlocks"). Called once per completed
 * match, after `enqueueRecordMatch` reports success — never before, since
 * `getStats` would otherwise read stale pre-match counters.
 *
 * `notify` is a thin seam so `MatchRoom` (the only caller) can send
 * `MESSAGE_TYPES.PROFILE_UNLOCKS` to whichever connected client currently
 * holds that userId's session, without this function needing to know
 * anything about Colyseus `Client`s itself — a participant who already left
 * the room simply gets no notification this call, since there's no session
 * left to send one to (their unlock is still granted and persisted either
 * way, and their next join's `getUnlocks` will reflect it).
 */
export async function evaluateAndGrantUnlocks(
  repo: PlayerRepository,
  userIds: readonly string[],
  notify: (userId: string, newlyUnlocked: readonly string[]) => void,
): Promise<void> {
  for (const userId of userIds) {
    const [stats, owned] = await Promise.all([repo.getStats(userId), repo.getUnlocks(userId)]);
    const newlyUnlocked = evaluateUnlocks(stats, owned);
    if (newlyUnlocked.length === 0) {
      continue;
    }
    for (const itemId of newlyUnlocked) {
      await repo.grantUnlock(userId, itemId);
    }
    notify(userId, newlyUnlocked);
  }
}
