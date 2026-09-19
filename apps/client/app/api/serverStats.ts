import { useEffect, useState } from "react";
import { getRuntimeConfig } from "../config/runtime.js";

export interface ServerStats {
  readonly players: number;
  readonly rooms: number;
  readonly version: string;
}

const TIMEOUT_MS = 4_000;
/** Matches the server's own cache window: asking more often can't yield fresher data. */
const CACHE_MS = 5_000;

function httpOrigin(wsUrl: string): string {
  return wsUrl.replace(/^ws(s?):\/\//, "http$1://").replace(/\/$/, "");
}

function isServerStats(value: unknown): value is ServerStats {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record["players"] === "number" &&
    typeof record["rooms"] === "number" &&
    typeof record["version"] === "string"
  );
}

/**
 * `GET /stats` on the game server, or `null` for any failure: offline, slow,
 * 4xx/5xx, a body of the wrong shape. Never throws: the callers are decoration
 * on the front page and footer, and a missing number must not read as an error.
 */
export async function fetchServerStats(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ServerStats | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${httpOrigin(baseUrl)}/stats`, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    const body: unknown = await response.json();
    return isServerStats(body) ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let shared: { at: number; promise: Promise<ServerStats | null> } | null = null;

/** One in-flight request shared by the header, footer and landing page. */
function getSharedStats(): Promise<ServerStats | null> {
  const now = Date.now();
  if (!shared || now - shared.at >= CACHE_MS) {
    let baseUrl: string;
    try {
      baseUrl = getRuntimeConfig().GAME_SERVER_URL;
    } catch {
      return Promise.resolve(null);
    }
    shared = { at: now, promise: fetchServerStats(baseUrl) };
  }
  return shared.promise;
}

/** Test seam: forget the shared request. */
export function resetServerStatsCache(): void {
  shared = null;
}

/** The latest server stats, `null` until they arrive and for good if they never do. */
export function useServerStats(): ServerStats | null {
  const [stats, setStats] = useState<ServerStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getSharedStats().then((result) => {
      if (!cancelled) {
        setStats(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}
