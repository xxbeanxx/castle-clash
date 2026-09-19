import type { Application, Request } from "express";
import { FixedWindowRateLimiter } from "./rateLimit.js";

export interface PublicStats {
  readonly players: number;
  readonly rooms: number;
}

export interface PublicStatsOptions {
  /** Where the figures come from (`matchMaker.stats.local` in production). */
  readonly read: () => PublicStats | Promise<PublicStats>;
  readonly version: string;
  /** Exact origins allowed to read this cross-origin. Unset or empty means any
   *  origin: the response is two public counters, so `*` leaks nothing. */
  readonly allowedOrigins?: readonly string[];
  readonly cacheMs?: number;
  readonly maxRequestsPerMinute?: number;
  readonly now?: () => number;
}

const DEFAULT_CACHE_MS = 5_000;
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 60;

/** The caller's address for bucketing the rate limit, never for anything sensitive.
 *  A client can put anything at the left of `X-Forwarded-For`; the proxy in front
 *  of us appends the address it actually saw at the right, so that is the one to
 *  trust. Falls back to the socket when there is no proxy (local runs). */
function clientKey(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const hops = (Array.isArray(forwarded) ? forwarded.join(",") : (forwarded ?? ""))
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops[hops.length - 1] ?? req.socket.remoteAddress ?? "unknown";
}

/**
 * `GET /stats`: the landing page's "players online" figure. Public, cached for a
 * few seconds so a busy front page can't turn into load on the matchmaker, and
 * rate-limited per address. The client treats any failure as "hide the figure",
 * so a 503 here is a normal, quiet outcome, never an alarm.
 */
export function registerPublicStatsRoute(app: Application, options: PublicStatsOptions): void {
  const cacheMs = options.cacheMs ?? DEFAULT_CACHE_MS;
  const now = options.now ?? Date.now;
  const allowedOrigins = options.allowedOrigins ?? [];
  const limiter = new FixedWindowRateLimiter(
    options.maxRequestsPerMinute ?? DEFAULT_MAX_REQUESTS_PER_MINUTE,
    60_000,
  );
  let cached: { at: number; body: PublicStats & { version: string } } | null = null;

  app.get("/stats", async (req, res) => {
    if (allowedOrigins.length === 0) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    } else {
      res.vary("Origin");
      const origin = req.headers.origin;
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      }
    }

    if (!limiter.consume(clientKey(req), now())) {
      res.status(429).json({ status: "rate_limited" });
      return;
    }

    if (!cached || now() - cached.at >= cacheMs) {
      try {
        const { players, rooms } = await options.read();
        cached = { at: now(), body: { players, rooms, version: options.version } };
      } catch {
        res.status(503).json({ status: "unavailable" });
        return;
      }
    }

    res.setHeader("Cache-Control", `public, max-age=${Math.floor(cacheMs / 1000)}`);
    res.status(200).json(cached.body);
  });
}
