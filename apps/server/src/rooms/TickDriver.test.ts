import { describe, expect, it, vi } from "vitest";
import { IntervalTickDriver, ManualTickDriver } from "./TickDriver.js";

describe("IntervalTickDriver", () => {
  it("delegates to the room's setTimestep at the configured tick rate", () => {
    const room = { setTimestep: vi.fn() };
    const driver = new IntervalTickDriver(room, 60);
    const callback = vi.fn();

    driver.start(callback);

    expect(room.setTimestep).toHaveBeenCalledWith(callback, 1000 / 60);
  });
});

describe("ManualTickDriver", () => {
  it("does not invoke the callback until step() is called", () => {
    const driver = new ManualTickDriver();
    const callback = vi.fn();
    driver.start(callback);

    expect(callback).not.toHaveBeenCalled();
  });

  it("invokes the callback once per step, in order, with the given delta", () => {
    const driver = new ManualTickDriver();
    const callback = vi.fn();
    driver.start(callback);

    driver.step(3, 16);

    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenNthCalledWith(1, 16);
    expect(callback).toHaveBeenNthCalledWith(3, 16);
  });

  it("defaults to a single step with a zero delta", () => {
    const driver = new ManualTickDriver();
    const callback = vi.fn();
    driver.start(callback);

    driver.step();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(0);
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
