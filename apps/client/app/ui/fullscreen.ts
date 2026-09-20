/**
 * Fullscreen and landscape lock, by feature detection only (plan Phase 13 step 8). Facts, from MDN's
 * compat data (`docs/research/phase13-mobile-browser-facts.md`): iPhone Safari has no Fullscreen
 * API (`document.fullscreenEnabled` is not true there, so the button hides itself); iPad has a
 * partial one; `screen.orientation.lock()` does not exist on any iOS Safari and on Android Chrome
 * only works from fullscreen. Every call is therefore optional and failures are swallowed: the
 * rotate prompt, not the lock, is what guarantees landscape.
 */
export function canFullscreen(doc: Document = document): boolean {
  return doc.fullscreenEnabled === true;
}

export function isFullscreen(doc: Document = document): boolean {
  return doc.fullscreenElement != null;
}

/** Enters fullscreen and asks for landscape, or leaves both. Resolves either way. */
export async function toggleFullscreen(doc: Document = document): Promise<void> {
  const orientation = globalThis.screen?.orientation as
    | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
    | undefined;
  try {
    if (isFullscreen(doc)) {
      orientation?.unlock?.();
      await doc.exitFullscreen();
      return;
    }
    await doc.documentElement.requestFullscreen({ navigationUI: "hide" });
    // Only allowed from fullscreen on Android Chrome; a rejection or a missing method is normal.
    await orientation?.lock?.("landscape");
  } catch {
    // Denied (no user gesture, policy) or unsupported: the game plays the same without it.
  }
}
