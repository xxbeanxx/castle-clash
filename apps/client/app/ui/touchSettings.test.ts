import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TOUCH_SETTINGS,
  loadTouchSettings,
  OPACITY_RANGE,
  parseTouchSettings,
  saveTouchSettings,
  SIZE_RANGE,
  TOUCH_SETTINGS_KEY,
} from "./touchSettings.js";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("parseTouchSettings", () => {
  it("returns defaults for nothing, junk, or non-objects", () => {
    expect(parseTouchSettings(null)).toEqual(DEFAULT_TOUCH_SETTINGS);
    expect(parseTouchSettings("{nope")).toEqual(DEFAULT_TOUCH_SETTINGS);
    expect(parseTouchSettings("42")).toEqual(DEFAULT_TOUCH_SETTINGS);
    expect(parseTouchSettings("null")).toEqual(DEFAULT_TOUCH_SETTINGS);
  });

  it("clamps out-of-range values, so a hand-edited value cannot hide the controls", () => {
    const parsed = parseTouchSettings(JSON.stringify({ size: 99, opacity: 0, leftHanded: true }));
    expect(parsed).toEqual({ size: SIZE_RANGE.max, opacity: OPACITY_RANGE.min, leftHanded: true });
  });

  it("falls back per field for wrong types", () => {
    const parsed = parseTouchSettings(
      JSON.stringify({ size: "big", opacity: null, leftHanded: 1 }),
    );
    expect(parsed).toEqual(DEFAULT_TOUCH_SETTINGS);
  });
});

describe("load and save", () => {
  it("round-trips", () => {
    saveTouchSettings({ size: 1.2, opacity: 0.8, leftHanded: true });
    expect(loadTouchSettings()).toEqual({ size: 1.2, opacity: 0.8, leftHanded: true });
  });

  it("uses defaults when storage throws on read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadTouchSettings()).toEqual(DEFAULT_TOUCH_SETTINGS);
  });

  it("does not throw when storage throws on write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => saveTouchSettings(DEFAULT_TOUCH_SETTINGS)).not.toThrow();
  });

  it("stores under one namespaced key", () => {
    saveTouchSettings(DEFAULT_TOUCH_SETTINGS);
    expect(localStorage.getItem(TOUCH_SETTINGS_KEY)).not.toBeNull();
  });
});
