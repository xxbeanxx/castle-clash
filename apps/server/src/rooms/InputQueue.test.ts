import { describe, expect, it } from "vitest";
import { InputQueue } from "./InputQueue.js";

const SID = "session-1";

describe("InputQueue", () => {
  it("accepts an input with a fresh seq", () => {
    const queue = new InputQueue();
    expect(queue.push(SID, { seq: 1, bits: 1 })).toBe(true);
  });

  it("rejects an input whose seq is not greater than the last accepted", () => {
    const queue = new InputQueue();
    queue.push(SID, { seq: 5, bits: 1 });
    expect(queue.push(SID, { seq: 5, bits: 2 })).toBe(false);
    expect(queue.push(SID, { seq: 3, bits: 2 })).toBe(false);
  });

  it("caps buffered depth at 8, dropping the oldest first", () => {
    const queue = new InputQueue();
    for (let seq = 1; seq <= 10; seq++) {
      queue.push(SID, { seq, bits: seq });
    }

    const drained: number[] = [];
    for (let i = 0; i < 10; i++) {
      drained.push(queue.consume(SID).seq);
    }

    // seq 1 and 2 were dropped to stay at depth 8; 3..10 come out oldest-first.
    expect(drained.slice(0, 8)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("consumes buffered frames oldest-first", () => {
    const queue = new InputQueue();
    queue.push(SID, { seq: 1, bits: 10 });
    queue.push(SID, { seq: 2, bits: 20 });

    expect(queue.consume(SID)).toEqual({ seq: 1, bits: 10 });
    expect(queue.consume(SID)).toEqual({ seq: 2, bits: 20 });
  });

  it("repeats the last frame for up to 6 ticks once the buffer runs dry", () => {
    const queue = new InputQueue();
    queue.push(SID, { seq: 1, bits: 42 });
    queue.consume(SID); // drains the only buffered frame

    for (let i = 0; i < 6; i++) {
      expect(queue.consume(SID)).toEqual({ seq: 1, bits: 42 });
    }
  });

  it("falls back to neutral (bits 0) after the repeat window expires", () => {
    const queue = new InputQueue();
    queue.push(SID, { seq: 1, bits: 42 });
    queue.consume(SID);

    for (let i = 0; i < 6; i++) {
      queue.consume(SID);
    }

    expect(queue.consume(SID).bits).toBe(0);
    expect(queue.consume(SID).bits).toBe(0);
  });

  it("resumes repeating a fresh frame's bits once new input arrives after going neutral", () => {
    const queue = new InputQueue();
    queue.push(SID, { seq: 1, bits: 1 });
    queue.consume(SID);
    for (let i = 0; i < 7; i++) queue.consume(SID); // exhaust repeat window, go neutral

    queue.push(SID, { seq: 2, bits: 99 });
    expect(queue.consume(SID)).toEqual({ seq: 2, bits: 99 });
    expect(queue.consume(SID)).toEqual({ seq: 2, bits: 99 }); // repeating again
  });

  it("returns neutral for a session with no history at all", () => {
    const queue = new InputQueue();
    expect(queue.consume("unknown")).toEqual({ seq: 0, bits: 0 });
  });

  it("forgets a removed player's state", () => {
    const queue = new InputQueue();
    queue.push(SID, { seq: 5, bits: 1 });
    queue.removePlayer(SID);
    expect(queue.push(SID, { seq: 1, bits: 1 })).toBe(true); // seq 1 accepted again — history was cleared
  });
});
