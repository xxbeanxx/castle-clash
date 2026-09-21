import type { AABB } from "@castle-clash/shared";
import type { Raster } from "../viewmodel/raster.js";
import type { StageTransform, SurfaceLayout } from "./surface.js";

/**
 * The arena's static picture (backdrop, props and terrain, baked into one image) as a DOM canvas
 * *behind* the transparent Pixi canvas, moved with the stage transform each frame.
 *
 * Why not a Pixi sprite: a full-screen textured quad through Pixi measured about 35 ms a frame
 * under software GL (headless Chromium, so CI's e2e and a low-end phone), against 17 ms with it
 * hidden, and the cost follows the area Pixi draws. The browser compositor draws a static layer
 * for free, and Pixi is left with only what moves (knights, hazards, effects). The art grid is the
 * same one Pixi's canvas uses (`image-rendering: pixelated`, an integer scale in physical pixels).
 */
export class Backdrop {
  readonly #canvas: HTMLCanvasElement;
  readonly #host: HTMLElement;
  readonly #bounds: AABB;
  #transform = "";

  /** `host` must be a positioned element that isolates its stacking context (`.cc-game__canvas`). */
  constructor(host: HTMLElement, raster: Raster, bounds: AABB) {
    this.#host = host;
    this.#bounds = bounds;
    const canvas = document.createElement("canvas");
    canvas.width = raster.w;
    canvas.height = raster.h;
    canvas
      .getContext("2d")
      ?.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.w, raster.h), 0, 0);
    Object.assign(canvas.style, {
      position: "absolute",
      left: "0",
      top: "0",
      zIndex: "-1",
      transformOrigin: "0 0",
      imageRendering: "pixelated",
      pointerEvents: "none",
      willChange: "transform",
    });
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.testid = "arena-backdrop";
    host.prepend(canvas);
    this.#canvas = canvas;
  }

  /** Puts the picture where the stage puts the arena: `stage` and `layout` are in physical pixels,
   *  the host is laid out in CSS pixels, and the ratio between them is the device pixel ratio. */
  place(stage: StageTransform, layout: SurfaceLayout): void {
    const cssPerPhys = this.#host.clientWidth / layout.physW;
    const x = (stage.x + this.#bounds.x * stage.scale) * cssPerPhys;
    const y = (stage.y + this.#bounds.y * stage.scale) * cssPerPhys;
    const scale = layout.scale * cssPerPhys;
    const next = `translate(${x}px, ${y}px) scale(${scale})`;
    if (next !== this.#transform) {
      this.#transform = next;
      this.#canvas.style.transform = next;
    }
  }

  destroy(): void {
    this.#canvas.remove();
  }
}
