import { type Application, TextureSource } from "pixi.js";
import { computeSurface, type SurfaceLayout } from "./surface.js";

/** Pixi options for a pixel-art surface (ADR 0002). The backing store is sized in physical pixels
 *  by `SurfaceController`, so `resolution` stays 1 and `autoDensity` off: Pixi's own DPR handling
 *  rounds a fractional DPR differently from `computeSurface`, which would break the integer scale. */
export const PIXEL_ART_INIT = {
  width: 1,
  height: 1,
  resolution: 1,
  autoDensity: false,
  antialias: false,
  roundPixels: true,
  powerPreference: "high-performance",
  backgroundColor: 0x1a1a1a,
} as const;

/** Textures sample with `nearest`, never blurring an art pixel. Global to Pixi, which is fine:
 *  this app has no smooth-scaled art. */
export function nearestTextureScaling(): void {
  TextureSource.defaultOptions.scaleMode = "nearest";
}

/**
 * Keeps the canvas's backing store at the container's physical size, and computes the
 * integer-scale `SurfaceLayout` for it. Re-runs on container resize (rotation, window resize,
 * mobile browser chrome sliding) and on a DPR change (browser zoom, moving between monitors),
 * and ignores a 0-size container (`display: none`, or not yet laid out) by keeping the last
 * layout.
 */
export class SurfaceController {
  readonly #app: Application;
  readonly #container: HTMLElement;
  readonly #onChange: (layout: SurfaceLayout) => void;
  #layout: SurfaceLayout | null = null;
  #observer: ResizeObserver | null = null;
  #dprQuery: MediaQueryList | null = null;

  constructor(
    app: Application,
    container: HTMLElement,
    onChange: (layout: SurfaceLayout) => void = () => {},
  ) {
    this.#app = app;
    this.#container = container;
    this.#onChange = onChange;
  }

  get layout(): SurfaceLayout | null {
    return this.#layout;
  }

  start(): void {
    this.#app.canvas.style.imageRendering = "pixelated";
    this.#app.canvas.style.display = "block";
    this.#observer = new ResizeObserver(() => this.apply());
    this.#observer.observe(this.#container);
    this.#watchDpr();
    this.apply();
  }

  stop(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#dprQuery?.removeEventListener("change", this.#onDprChange);
    this.#dprQuery = null;
  }

  apply(): void {
    const cssW = this.#container.clientWidth;
    const cssH = this.#container.clientHeight;
    const next = computeSurface(cssW, cssH, window.devicePixelRatio);
    if (!next) {
      return;
    }
    const prev = this.#layout;
    this.#layout = next;
    if (!prev || prev.physW !== next.physW || prev.physH !== next.physH) {
      this.#app.renderer.resize(next.physW, next.physH);
    }
    this.#app.canvas.style.width = `${cssW}px`;
    this.#app.canvas.style.height = `${cssH}px`;
    this.#onChange(next);
  }

  /** `(resolution: Ndppx)` only matches the current DPR, so it fires once when the DPR changes
   *  and has to be re-armed for the new value. */
  #watchDpr(): void {
    this.#dprQuery?.removeEventListener("change", this.#onDprChange);
    this.#dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    this.#dprQuery.addEventListener("change", this.#onDprChange);
  }

  #onDprChange = (): void => {
    this.#watchDpr();
    this.apply();
  };
}
