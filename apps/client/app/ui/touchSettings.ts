/** Player-tunable touch layout (plan Phase 13 step 7). Per-device, so localStorage, and every
 *  access is wrapped: storage throws in private windows and with site data blocked, and the
 *  controls must work with the defaults regardless. */
export interface TouchSettings {
  /** Scales every control; 1 is the design size (buttons never drop under 48 CSS px at >= 0.85). */
  size: number;
  /** Idle opacity of the controls. The floor keeps them findable. */
  opacity: number;
  /** Swaps the stick and the button cluster. */
  leftHanded: boolean;
}

export const SIZE_RANGE = { min: 0.85, max: 1.4 } as const;
export const OPACITY_RANGE = { min: 0.4, max: 1 } as const;
export const DEFAULT_TOUCH_SETTINGS: TouchSettings = { size: 1, opacity: 0.6, leftHanded: false };
export const TOUCH_SETTINGS_KEY = "cc.touch.settings";

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(value, min), max)
    : fallback;
}

/** Reads whatever is stored, repairing anything out of range or of the wrong type. */
export function parseTouchSettings(raw: string | null): TouchSettings {
  if (!raw) {
    return DEFAULT_TOUCH_SETTINGS;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) {
      return DEFAULT_TOUCH_SETTINGS;
    }
    const record = value as Record<string, unknown>;
    return {
      size: clamp(record.size, SIZE_RANGE.min, SIZE_RANGE.max, DEFAULT_TOUCH_SETTINGS.size),
      opacity: clamp(
        record.opacity,
        OPACITY_RANGE.min,
        OPACITY_RANGE.max,
        DEFAULT_TOUCH_SETTINGS.opacity,
      ),
      leftHanded: record.leftHanded === true,
    };
  } catch {
    return DEFAULT_TOUCH_SETTINGS;
  }
}

export function loadTouchSettings(): TouchSettings {
  try {
    return parseTouchSettings(globalThis.localStorage.getItem(TOUCH_SETTINGS_KEY));
  } catch {
    return DEFAULT_TOUCH_SETTINGS;
  }
}

export function saveTouchSettings(settings: TouchSettings): void {
  try {
    globalThis.localStorage.setItem(TOUCH_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Nowhere to persist; the change still applies for this session.
  }
}
