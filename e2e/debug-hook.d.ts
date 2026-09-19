export {};

/**
 * The `window.__CC_DEBUG__` shape `game/debug.ts`'s `CastleClashDebugHook`
 * installs (`VITE_E2E=1` builds only) — shared here so every spec augments
 * the same global declaration instead of each redeclaring its own
 * (conflicting) shape, which `tsc` rejects outright when more than one spec
 * needs `window.__CC_DEBUG__`.
 */
declare global {
  interface Window {
    __CC_DEBUG__?: {
      localPosition(): { x: number; y: number } | null;
      allCosmetics(): Array<{
        tintPrimary: number;
        helmetId: string;
        capeId: string;
        weaponStyleId: string;
      }>;
      dropConnection(): void;
      frameStats(): {
        frames: number;
        meanMs: number;
        p95Ms: number;
        maxMs: number;
        slowFrames: number;
      } | null;
    };
  }
}
