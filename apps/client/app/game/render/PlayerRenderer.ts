import type { Container } from "pixi.js";
import type { KnightRect } from "../viewmodel/playersToRects.js";
import type { KnightAtlas } from "./KnightAtlas.js";
import { KnightView } from "./KnightView.js";
import { PlayerRectsView } from "./PlayerRects.js";

/** What `GameClient` draws players through: the knight art when its atlas loaded, tinted rects
 *  otherwise, so a failed asset request degrades to the old look instead of an empty arena. */
export interface PlayerRenderer {
  sync(rects: readonly KnightRect[], dtMs: number): void;
  /** Frees the atlas textures. The display objects go with the Pixi `Application`. */
  destroy(): void;
}

function build(
  playerLayer: Container,
  cosmeticLayer: Container,
  atlas: KnightAtlas | null,
): PlayerRenderer {
  if (!atlas) {
    const rects = new PlayerRectsView(playerLayer);
    return { sync: (r) => rects.sync(r), destroy: () => undefined };
  }
  const knights = new KnightView(playerLayer, atlas);
  const cosmetics = new PlayerRectsView(cosmeticLayer, { body: false });
  return {
    sync(rects, dtMs) {
      knights.sync(rects, dtMs);
      cosmetics.sync(rects);
    },
    destroy: () => atlas.destroy(),
  };
}

/**
 * Takes the atlas as a promise on purpose: `GameClient.start()` must register its room message
 * handlers the moment `joinRoom` resolves (the server sends the match code on join), so it cannot
 * also wait for the art. Until the promise settles nothing is drawn, which is a few frames; a
 * rejected load is `null` and falls back to rects. If `destroy()` runs first, the atlas is freed
 * as soon as it arrives.
 */
export function createPlayerRenderer(
  playerLayer: Container,
  cosmeticLayer: Container,
  atlas: Promise<KnightAtlas | null>,
): PlayerRenderer {
  let inner: PlayerRenderer | null = null;
  let destroyed = false;
  void atlas.then((loaded) => {
    if (destroyed) {
      loaded?.destroy();
      return;
    }
    inner = build(playerLayer, cosmeticLayer, loaded);
  });
  return {
    sync: (rects, dtMs) => inner?.sync(rects, dtMs),
    destroy() {
      destroyed = true;
      inner?.destroy();
      inner = null;
    },
  };
}
