import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryPlayerRepository } from "./InMemoryPlayerRepository.js";
import type { MatchResultRecord } from "./PlayerRepository.js";
import { enqueueRecordMatch, recordMatchFailureCount } from "./RecordMatchQueue.js";

function makeResult(matchId: string): MatchResultRecord {
  return {
    matchId,
    arenaIds: ["pit"],
    mode: "quick",
    startedAt: new Date(),
    endedAt: new Date(),
    winnerId: "player-1",
    serverVersion: "test",
    participants: [],
  };
}

const noWait = async () => {};

describe("enqueueRecordMatch", () => {
  beforeEach(() => {
    recordMatchFailureCount.value = 0;
  });

  it("calls recordMatch once when it succeeds on the first attempt", async () => {
    const repo = new InMemoryPlayerRepository();
    const spy = vi.spyOn(repo, "recordMatch");

    await enqueueRecordMatch(repo, makeResult("match-1"), noWait);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(recordMatchFailureCount.value).toBe(0);
  });

  it("retries after a transient failure and eventually succeeds", async () => {
    const repo = new InMemoryPlayerRepository();
    let calls = 0;
    vi.spyOn(repo, "recordMatch").mockImplementation(async (result) => {
      calls += 1;
      if (calls < 3) {
        throw new Error("transient");
      }
      return InMemoryPlayerRepository.prototype.recordMatch.call(repo, result);
    });

    await enqueueRecordMatch(repo, makeResult("match-2"), noWait);

    expect(calls).toBe(3);
    expect(recordMatchFailureCount.value).toBe(0);
    expect(repo.recordedMatches.has("match-2")).toBe(true);
  });

  it("gives up after the max attempts and increments the failure metric, without throwing", async () => {
    const repo = new InMemoryPlayerRepository();
    vi.spyOn(repo, "recordMatch").mockRejectedValue(new Error("permanent"));

    await expect(enqueueRecordMatch(repo, makeResult("match-3"), noWait)).resolves.toBeUndefined();

    expect(recordMatchFailureCount.value).toBe(1);
  });
});
