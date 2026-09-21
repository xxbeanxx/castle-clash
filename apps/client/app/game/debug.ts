import type { GameClient, PlayerCosmetics } from "./GameClient.js";

export interface CastleClashDebugHook {
  localPosition(): { x: number; y: number } | null;
  /** Plan Phase 9's e2e gate — every connected player's synced cosmetics,
   *  so a test can assert a saved loadout propagated to another browser. */
  allCosmetics(): PlayerCosmetics[];
  /** Phase 13 step 10: drop the socket abnormally and let the SDK reconnect. */
  dropConnection(): void;
  /** Phase 13 step 12: rolling frame-time summary (mean/p95/max, slow-frame count). */
  frameStats(): GameClient["frameSummary"];
  /** Phase 13: the render surface's layout and applied stage transform (ADR 0002). */
  surface(): GameClient["surfaceState"];
  /** Phase 15: how many effect particles (sparks, dust) are alive right now. */
  fxActive(): number;
}

declare global {
  interface Window {
    __CC_DEBUG__?: CastleClashDebugHook;
  }
}

/**
 * Exposes `window.__CC_DEBUG__` for `e2e/private-match.spec.ts` to assert on
 * real gameplay state (e.g. "holding RIGHT moved the local player") without
 * reading canvas pixels. Compiled in only when `VITE_E2E=1` — a production
 * build never defines this env var, so `apps/client/containerfile`'s
 * default build never ships the hook (plan Phase 5's CI/CD section).
 */
export function installE2eDebugHook(client: GameClient): void {
  if (!import.meta.env.VITE_E2E) {
    return;
  }
  window.__CC_DEBUG__ = {
    localPosition: () => client.localPosition,
    allCosmetics: () => client.allCosmetics,
    dropConnection: () => client.simulateDrop(),
    frameStats: () => client.frameSummary,
    surface: () => client.surfaceState,
    fxActive: () => client.fxActive,
  };
}
