import { describe, expect, it } from "vitest";
import { CompositeInput } from "./CompositeInput.js";
import type { InputSource } from "./InputSource.js";

class FakeSource implements InputSource {
  attached = 0;
  detached = 0;
  samples = 0;
  constructor(private readonly bits: number) {}
  attach(): void {
    this.attached += 1;
  }
  detach(): void {
    this.detached += 1;
  }
  sample(): number {
    this.samples += 1;
    return this.bits;
  }
}

describe("CompositeInput", () => {
  it("ORs every source's bits", () => {
    const input = new CompositeInput([new FakeSource(0b001), new FakeSource(0b100)]);
    expect(input.sample()).toBe(0b101);
  });

  it("samples 0 with no sources", () => {
    expect(new CompositeInput([]).sample()).toBe(0);
  });

  it("samples every source even once the bits are already set (each clears its own latch)", () => {
    const first = new FakeSource(0b1);
    const second = new FakeSource(0b1);
    new CompositeInput([first, second]).sample();
    expect(first.samples).toBe(1);
    expect(second.samples).toBe(1);
  });

  it("attaches and detaches every source", () => {
    const a = new FakeSource(0);
    const b = new FakeSource(0);
    const input = new CompositeInput([a, b]);
    input.attach();
    input.detach();
    expect([a.attached, b.attached, a.detached, b.detached]).toEqual([1, 1, 1, 1]);
  });
});
