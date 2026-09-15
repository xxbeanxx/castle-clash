export interface RuntimeConfig {
  GAME_SERVER_URL: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
}

declare global {
  interface Window {
    __CONFIG__?: RuntimeConfig;
  }
}

/**
 * `config.js` (rendered by the client container's entrypoint from env vars) sets
 * `window.__CONFIG__` before the app bundle loads. `pnpm dev`'s Vite server never
 * serves that file, so dev mode falls back to a config pointing at a locally
 * running server instead of failing to boot. `VITE_GAME_SERVER_URL` overrides just
 * the server URL in dev, so `pnpm dev` can be reached from another device on the
 * LAN (e.g. a phone), where `ws://localhost:2567` would otherwise point at itself.
 */
export function getRuntimeConfig(): RuntimeConfig {
  if (window.__CONFIG__) {
    return window.__CONFIG__;
  }
  if (import.meta.env.DEV) {
    return {
      GAME_SERVER_URL: import.meta.env.VITE_GAME_SERVER_URL ?? "ws://localhost:2567",
      SUPABASE_URL: "",
      SUPABASE_PUBLISHABLE_KEY: "",
    };
  }
  throw new Error("window.__CONFIG__ is not set — is config.js loaded before the app bundle?");
}
