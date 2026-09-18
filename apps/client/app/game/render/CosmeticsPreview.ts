import { Application, Container } from "pixi.js";
import { PlayerRectsView } from "./PlayerRects.js";

const PREVIEW_ID = "preview";

export interface CosmeticsPreviewState {
  tint: number;
  helmetTint?: number;
  capeTint?: number;
}

/**
 * The loadout route's `<KnightPreview>` (plan Phase 9 step 4) — a tiny
 * standalone Pixi `Application`, not a `GameClient` (no room, no camera, no
 * sim loop: just one static, centered `PlayerRect`). Reuses
 * `PlayerRectsView` directly rather than a parallel rendering path, so the
 * preview and an actual match always draw a given loadout identically. See
 * `docs/research/phase9-cosmetics-rendering-deviation.md` for why this is
 * tinted indicator rects and not real knight-art sprite layers.
 */
export class CosmeticsPreview {
  #app: Application | null = null;
  #view: PlayerRectsView | null = null;

  async start(container: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({ resizeTo: container, backgroundColor: 0x1a1a1a });
    container.appendChild(app.canvas);

    const layer = new Container();
    app.stage.addChild(layer);

    this.#app = app;
    this.#view = new PlayerRectsView(layer);
  }

  /** No-ops if called before `start()` resolves or after `destroy()` — the
   *  caller (`ui/LoadoutPreview.tsx`) re-calls this once mounting
   *  completes, so a call racing ahead of `start()` just means one frame's
   *  worth of state update is dropped, not lost permanently. */
  sync(state: CosmeticsPreviewState): void {
    if (!this.#view || !this.#app) {
      return;
    }
    this.#view.sync([
      {
        id: PREVIEW_ID,
        action: "Idle",
        x: this.#app.screen.width / 2,
        y: this.#app.screen.height / 2,
        ...state,
      },
    ]);
  }

  destroy(): void {
    this.#app?.destroy(true, { children: true });
    this.#app = null;
    this.#view = null;
  }
}
