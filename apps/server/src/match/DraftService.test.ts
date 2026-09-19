import { DRAFT_TICKS, playerId } from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import { DraftService } from "./DraftService.js";

const A = playerId("a");
const B = playerId("b");

function players() {
  return [
    { id: A, placement: 1, ownedStacks: {} },
    { id: B, placement: 2, ownedStacks: {} },
  ];
}

describe("DraftService", () => {
  it("generates a private offer per player, seeded deterministically", () => {
    const service = new DraftService(1);
    const offers = service.startRound(1, 0, players());

    expect(offers.get(A)!.offers).toHaveLength(3);
    expect(offers.get(B)!.offers).toHaveLength(3);
    // Different players (different seeds) don't necessarily see the same
    // three ids — this only pins that each is independently well-formed.
    expect(new Set(offers.get(A)!.offers).size).toBe(3);
    expect(new Set(offers.get(B)!.offers).size).toBe(3);

    const replay = new DraftService(1).startRound(1, 0, players());
    expect(replay.get(A)!.offers).toEqual(offers.get(A)!.offers);
    expect(replay.get(B)!.offers).toEqual(offers.get(B)!.offers);
  });

  it("rejects a pick outside that player's own offer set", () => {
    const service = new DraftService(1);
    service.startRound(1, 0, players());
    const bogus = "not-a-real-power-up";

    expect(service.pick(A, bogus)).toBe(false);
    expect(service.isComplete()).toBe(false);
  });

  it("rejects a pick from an unknown player", () => {
    const service = new DraftService(1);
    service.startRound(1, 0, [players()[0]!]);
    expect(service.pick(B, "anything")).toBe(false);
  });

  it("accepts a valid pick exactly once", () => {
    const service = new DraftService(1);
    const offers = service.startRound(1, 0, players());
    const validId = offers.get(A)!.offers[0];

    expect(service.pick(A, validId)).toBe(true);
    expect(service.pick(A, offers.get(A)!.offers[1])).toBe(false); // already picked
    expect(service.isComplete()).toBe(false); // B hasn't picked yet

    const validB = offers.get(B)!.offers[0];
    expect(service.pick(B, validB)).toBe(true);
    expect(service.isComplete()).toBe(true);
  });

  it("auto-picks deterministically once the timeout tick is reached", () => {
    const offersA = new DraftService(1).startRound(1, 0, players()).get(A)!;
    const endsAtTick = offersA.endsAtTick;
    expect(endsAtTick).toBe(DRAFT_TICKS);

    const service = new DraftService(1);
    service.startRound(1, 0, players());
    service.tick(endsAtTick - 1);
    expect(service.isComplete()).toBe(false);

    service.tick(endsAtTick);
    expect(service.isComplete()).toBe(true);

    const replay = new DraftService(1);
    replay.startRound(1, 0, players());
    replay.tick(endsAtTick);
    expect(replay.drainPicks()).toEqual(service.drainPicks());
  });

  it("drainPicks returns each resolved pick exactly once", () => {
    const service = new DraftService(1);
    const offers = service.startRound(1, 0, players());
    service.pick(A, offers.get(A)!.offers[0]);

    const first = service.drainPicks();
    expect(first.get(A)).toBe(offers.get(A)!.offers[0]);
    expect(first.has(B)).toBe(false);

    const second = service.drainPicks();
    expect(second.size).toBe(0);

    service.pick(B, offers.get(B)!.offers[0]);
    const third = service.drainPicks();
    expect(third.has(A)).toBe(false);
    expect(third.get(B)).toBe(offers.get(B)!.offers[0]);
  });

  it("removePlayer drops a departed player's offer/pick from completion tracking", () => {
    const service = new DraftService(1);
    service.startRound(1, 0, players());
    service.pick(A, service.offersFor(A)!.offers[0]);
    expect(service.isComplete()).toBe(false);

    service.removePlayer(B);
    expect(service.isComplete()).toBe(true);
  });
});
