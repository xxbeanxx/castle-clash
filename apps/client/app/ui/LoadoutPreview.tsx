import { useEffect, useRef } from "react";
import { CosmeticsPreview, type CosmeticsPreviewState } from "../game/render/CosmeticsPreview.js";

/** Mounts `game/render/CosmeticsPreview.ts`'s standalone Pixi `Application`
 *  (plan Phase 9 step 4's `<KnightPreview>`) into a fixed-size box and keeps
 *  it in sync with the loadout route's current form state. Split from the
 *  route component the same reason `ui/GameCanvas.tsx` is split from
 *  `routes/play.$roomId.tsx`: mounting/tearing down a Pixi `Application` is
 *  an effect, not something a route body should do inline. */
export function LoadoutPreview(state: CosmeticsPreviewState) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<CosmeticsPreview | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const preview = new CosmeticsPreview();
    previewRef.current = preview;
    void preview.start(container).then(() => {
      previewRef.current?.sync(state);
    });
    return () => {
      previewRef.current = null;
      preview.destroy();
    };
    // oxlint-disable-next-line react/exhaustive-deps -- mount/unmount only; the effect below handles every subsequent state change.
  }, []);

  useEffect(() => {
    previewRef.current?.sync(state);
  }, [state]);

  return (
    <div
      ref={containerRef}
      data-testid="loadout-preview"
      style={{ width: 160, height: 160, border: "1px solid #444" }}
    />
  );
}
