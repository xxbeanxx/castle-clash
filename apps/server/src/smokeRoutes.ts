import { timingSafeEqual } from "node:crypto";
import type { Application } from "express";
import type { TokenVerifier } from "./auth/verifyToken.js";
import { logger } from "./logger.js";
import type { PlayerRepository } from "./persistence/PlayerRepository.js";

/** The `matches.mode` value a deploy smoke writes. `record_match_result()`
 *  (see `supabase/migrations/*_smoke_matches_skip_stats.sql`) stores the
 *  match and its participant row but never touches `player_stats`, which is
 *  the only thing `public.leaderboard` reads — so a smoke match is
 *  recorded yet can never appear on a leaderboard. */
export const SMOKE_MODE = "smoke";

export interface SmokeRoutesOptions {
  /** `SMOKE_TOKEN` from the environment. Unset (the default for any
   *  deployment that doesn't opt in) registers no route at all. */
  readonly smokeToken: string | undefined;
  readonly verifyToken: TokenVerifier;
  readonly repository: PlayerRepository;
  readonly serverVersion: string;
}

function tokensMatch(expected: string, provided: string | undefined): boolean {
  if (provided === undefined) {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * `POST /smoke/record-match` — plan Phase 10's "deploy smoke ... confirms a
 * test match write (flagged `mode: "smoke"`, excluded from leaderboards)".
 *
 * A real match takes two players fighting to a result, which a post-deploy
 * check can't do; this exercises the same write path instead — deployed
 * server -> `PlayerRepository.recordMatch` -> Supabase `record_match_result()`
 * -> tables — and only answers 200 after that write resolved, so a wrong
 * `SUPABASE_SECRET_KEY` or an unapplied migration fails the deploy.
 *
 * Two gates: the shared `SMOKE_TOKEN` (constant-time compared; without it
 * the route doesn't exist) and a valid Supabase user JWT, whose `sub` is the
 * smoke match's only participant (the `player_id` foreign key needs a real
 * profile row, which anonymous sign-in creates).
 */
export function registerSmokeRoutes(app: Application, options: SmokeRoutesOptions): void {
  const { smokeToken } = options;
  if (!smokeToken) {
    return;
  }

  app.post("/smoke/record-match", async (req, res) => {
    if (!tokensMatch(smokeToken, req.header("x-smoke-token"))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const bearer = /^Bearer (.+)$/.exec(req.header("authorization") ?? "")?.[1];
    let userId: string;
    try {
      userId = (await options.verifyToken(bearer)).userId;
    } catch {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const matchId = crypto.randomUUID();
    const now = new Date();
    try {
      await options.repository.recordMatch({
        matchId,
        arenaIds: ["smoke"],
        mode: SMOKE_MODE,
        startedAt: now,
        endedAt: now,
        winnerId: userId,
        serverVersion: options.serverVersion,
        participants: [
          {
            playerId: userId,
            placement: 1,
            roundsWon: 0,
            eliminations: 0,
            deaths: 0,
            damageDealt: 0,
            powerups: [],
            weapon: "sword",
          },
        ],
      });
    } catch (error) {
      logger.error({ err: error, matchId }, "smoke match write failed");
      res.status(502).json({ error: "record failed" });
      return;
    }

    res.status(200).json({ matchId, serverVersion: options.serverVersion });
  });
}
