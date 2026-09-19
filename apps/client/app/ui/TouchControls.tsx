import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { TouchButton, TouchInput } from "../game/input/TouchInput.js";
import {
  loadTouchSettings,
  OPACITY_RANGE,
  saveTouchSettings,
  SIZE_RANGE,
  type TouchSettings,
} from "./touchSettings.js";

const BUTTONS: ReadonlyArray<{ id: TouchButton; label: string }> = [
  { id: "JUMP", label: "Jump" },
  { id: "LIGHT", label: "Light" },
  { id: "HEAVY", label: "Heavy" },
  { id: "BLOCK", label: "Block" },
  { id: "DODGE", label: "Dodge" },
];

/** Shown on a touch device from the start (`(pointer: coarse)`), on the first touch (a hybrid),
 *  and hidden again by a real key press (a tablet with a keyboard). */
function useTouchMode(): boolean {
  const [touch, setTouch] = useState(
    () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
  );
  useEffect(() => {
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (event.pointerType === "touch") {
        setTouch(true);
      }
    };
    const onKeyDown = () => setTouch(false);
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return touch;
}

function buttonUnder(x: number, y: number): TouchButton | null {
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-touch-button]");
  return (element?.dataset.touchButton as TouchButton | undefined) ?? null;
}

/**
 * The on-screen controls (plan Phase 13 step 7): a floating stick on the left half, an arc of
 * buttons on the right. DOM rather than Pixi for real pointer capture and accessible names. This
 * component only reports what each pointer does to `TouchInput`, which owns all the logic and is
 * tested without a DOM. Stick and pressed visuals are updated imperatively: React must not
 * re-render at pointer-move rate.
 */
export function TouchControls({ input }: { input: TouchInput }) {
  const visible = useTouchMode();
  const [settings, setSettings] = useState<TouchSettings>(loadTouchSettings);
  const [panelOpen, setPanelOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  // Nothing may stay pressed if the controls go away (a keypress hides them mid-touch).
  useEffect(() => {
    if (!visible) {
      input.releaseAll();
    }
  }, [visible, input]);

  const update = (patch: Partial<TouchSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveTouchSettings(next);
  };

  const syncPressed = () => {
    const held = input.heldButtons();
    rootRef.current?.querySelectorAll<HTMLElement>("[data-touch-button]").forEach((element) => {
      element.dataset.pressed = String(held.has(element.dataset.touchButton as TouchButton));
    });
  };

  const placeStick = (pointerId: number, x: number, y: number) => {
    const zone = zoneRef.current?.getBoundingClientRect();
    const origin = input.stickOrigin(pointerId);
    if (!zone || !origin || !baseRef.current || !knobRef.current) {
      return;
    }
    baseRef.current.style.transform = `translate(${origin.x - zone.left}px, ${origin.y - zone.top}px)`;
    knobRef.current.style.transform = `translate(${x - zone.left}px, ${y - zone.top}px)`;
  };

  const setStickActive = (active: boolean) => {
    if (zoneRef.current) {
      zoneRef.current.dataset.active = String(active);
    }
  };

  const onZoneDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    input.stickStart(event.pointerId, event.clientX, event.clientY);
    if (input.stickOrigin(event.pointerId)) {
      setStickActive(true);
      placeStick(event.pointerId, event.clientX, event.clientY);
    }
  };
  const onZoneMove = (event: PointerEvent<HTMLDivElement>) => {
    input.stickMove(event.pointerId, event.clientX, event.clientY);
    placeStick(event.pointerId, event.clientX, event.clientY);
  };
  const onZoneEnd = (event: PointerEvent<HTMLDivElement>) => {
    input.release(event.pointerId);
    setStickActive(false);
  };

  const onButtonDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse") {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    input.buttonDown(event.pointerId, event.currentTarget.dataset.touchButton as TouchButton);
    navigator.vibrate?.(8);
    syncPressed();
  };
  const onButtonMove = (event: PointerEvent<HTMLButtonElement>) => {
    input.buttonMove(event.pointerId, buttonUnder(event.clientX, event.clientY));
    syncPressed();
  };
  const onButtonEnd = (event: PointerEvent<HTMLButtonElement>) => {
    input.release(event.pointerId);
    syncPressed();
  };

  if (!visible) {
    return null;
  }

  const style = {
    "--tc-size": settings.size,
    "--tc-opacity": settings.opacity,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Touch controls"
      data-testid="touch-controls"
      data-handed={settings.leftHanded ? "left" : "right"}
      className="cc-touch"
      style={style}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        ref={zoneRef}
        data-testid="touch-stick-zone"
        data-active="false"
        className="cc-touch__zone"
        onPointerDown={onZoneDown}
        onPointerMove={onZoneMove}
        onPointerUp={onZoneEnd}
        onPointerCancel={onZoneEnd}
        onLostPointerCapture={onZoneEnd}
      >
        <div className="cc-touch__hint" aria-hidden="true" />
        <div ref={baseRef} className="cc-touch__base" aria-hidden="true" />
        <div ref={knobRef} className="cc-touch__knob" aria-hidden="true" />
      </div>

      <div className="cc-touch__cluster">
        {BUTTONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            data-touch-button={id}
            data-pressed="false"
            className={`cc-touch__btn cc-touch__btn--${id.toLowerCase()}`}
            onPointerDown={onButtonDown}
            onPointerMove={onButtonMove}
            onPointerUp={onButtonEnd}
            onPointerCancel={onButtonEnd}
            onLostPointerCapture={onButtonEnd}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="cc-touch__gear"
        aria-label="Touch control settings"
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen((open) => !open)}
      >
        ⚙
      </button>
      {panelOpen && (
        <div className="cc-touch__panel" role="dialog" aria-label="Touch control settings">
          <label>
            Size
            <input
              type="range"
              min={SIZE_RANGE.min}
              max={SIZE_RANGE.max}
              step={0.05}
              value={settings.size}
              onChange={(event) => update({ size: Number(event.target.value) })}
            />
          </label>
          <label>
            Opacity
            <input
              type="range"
              min={OPACITY_RANGE.min}
              max={OPACITY_RANGE.max}
              step={0.05}
              value={settings.opacity}
              onChange={(event) => update({ opacity: Number(event.target.value) })}
            />
          </label>
          <label className="cc-touch__check">
            <input
              type="checkbox"
              checked={settings.leftHanded}
              onChange={(event) => update({ leftHanded: event.target.checked })}
            />
            Left-handed
          </label>
        </div>
      )}
    </div>
  );
}
