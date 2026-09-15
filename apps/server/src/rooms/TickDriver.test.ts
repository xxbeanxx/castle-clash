import { describe, expect, it, vi } from "vitest";
import { IntervalTickDriver, ManualTickDriver } from "./TickDriver.js";

describe("IntervalTickDriver", () => {
  it("delegates to the room's setFixedTimestep at the configured tick rate", () => {
    const room = { setFixedTimestep: vi.fn() };
    const driver = new IntervalTickDriver(room, 60);
    const callback = vi.fn();

    driver.start(callback);

    expect(room.setFixedTimestep).toHaveBeenCalledWith(expect.any(Function), 60);
  });

  it("adapts the room's StepContext into the driver's fixed-step shape", () => {
    const room = { setFixedTimestep: vi.fn() };
    const driver = new IntervalTickDriver(room, 60);
    const callback = vi.fn();

    driver.start(callback);
    const stepFn = room.setFixedTimestep.mock.calls[0]![0] as (ctx: unknown) => void;
    stepFn({ dt: 1 / 60, dtMs: 16.6, tick: 3, subSteps: 1, subDt: 1 / 60, subDtMs: 16.6 });

    expect(callback).toHaveBeenCalledWith({ dt: 1 / 60, tick: 3 });
  });
});

describe("ManualTickDriver", () => {
  it("does not invoke the callback until step() is called", () => {
    const driver = new ManualTickDriver();
    const callback = vi.fn();
    driver.start(callback);

    expect(callback).not.toHaveBeenCalled();
  });

  it("invokes the callback once per step, in order, incrementing tick and using a fixed dt", () => {
    const driver = new ManualTickDriver();
    const callback = vi.fn();
    driver.start(callback);

    driver.step(3);

    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenNthCalledWith(1, { dt: 1 / 60, tick: 1 });
    expect(callback).toHaveBeenNthCalledWith(3, { dt: 1 / 60, tick: 3 });
  });

  it("defaults to a single step", () => {
    const driver = new ManualTickDriver();
    const callback = vi.fn();
    driver.start(callback);

    driver.step();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ dt: 1 / 60, tick: 1 });
  });

  it("accepts a custom dt while still incrementing tick by one per step", () => {
    const driver = new ManualTickDriver();
    const callback = vi.fn();
    driver.start(callback);

    driver.step(2, 1 / 30);

    expect(callback).toHaveBeenNthCalledWith(1, { dt: 1 / 30, tick: 1 });
    expect(callback).toHaveBeenNthCalledWith(2, { dt: 1 / 30, tick: 2 });
  });

  it("stops invoking the callback after stop()", () => {
    const driver = new ManualTickDriver();
    const callback = vi.fn();
    driver.start(callback);
    driver.stop();

    driver.step(2);

    expect(callback).not.toHaveBeenCalled();
  });
});
