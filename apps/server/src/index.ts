import { MATCH_ROOM_NAME } from "@castle-clash/shared";
import { monitor } from "@colyseus/monitor";
import { defineRoom, defineServer, WebSocketTransport } from "colyseus";
import { createDefaultTokenVerifier } from "./auth/verifyToken.js";
import { envNumber } from "./env.js";
import { registerHealthRoutes } from "./http.js";
import { logger } from "./logger.js";
import { registerMetricsRoute } from "./observability/metrics.js";
import { createSupabasePlayerRepository } from "./persistence/createPlayerRepository.js";
import { FixedWindowRateLimiter } from "./rateLimit.js";
import { MatchRoom } from "./rooms/MatchRoom.js";
import { serverVersion } from "./serverVersion.js";
import { installGracefulShutdown, isDraining } from "./shutdown.js";
import { registerSmokeRoutes } from "./smokeRoutes.js";

/** Plan Phase 10 step 1's "max message size": `ws` closes a connection with
 *  1009 (message too big) for any frame over this. The largest legitimate
 *  client message is one `input` frame or `draft:pick` — a few dozen bytes —
 *  so 4 KiB is generous headroom, not a tight fit. */
const MAX_MESSAGE_BYTES = 4 * 1024;

/** Plan Phase 10 step 1's "join rate limit per IP": runs in the transport's
 *  `beforeUpgrade` hook, before any room/auth work happens, so a flood of
 *  connection attempts costs one map lookup each. */
const MAX_UPGRADES_PER_IP_PER_MINUTE = envNumber("MAX_UPGRADES_PER_IP_PER_MINUTE", 60);
const upgradeRateLimiter = new FixedWindowRateLimiter(MAX_UPGRADES_PER_IP_PER_MINUTE, 60_000);

export const server = defineServer({
  rooms: {
    [MATCH_ROOM_NAME]: defineRoom(MatchRoom).filterBy(["mode", "code"]),
  },
  transport: new WebSocketTransport({
    maxPayload: MAX_MESSAGE_BYTES,
    beforeUpgrade: (_request, context) => {
      // No resolvable IP (no proxy header, no peer address) can't be keyed —
      // let it through rather than lumping every such client into one bucket.
      if (context.ip && !upgradeRateLimiter.consume(context.ip)) {
        return new Response(null, { status: 429 });
      }
    },
  }),
  // `shutdown.ts`'s `installGracefulShutdown` replaces Colyseus's own
  // built-in SIGTERM handler (which waits for every room to dispose
  // naturally with no timeout at all) with a `DRAIN_TIMEOUT`-bounded one —
  // see that module's doc comment for why.
  gracefullyShutdown: false,
  express: (app) => {
    registerHealthRoutes(app, isDraining, serverVersion());
    registerMetricsRoute(app);
    const smokeToken = process.env["SMOKE_TOKEN"];
    if (smokeToken) {
      const repository = createSupabasePlayerRepository();
      if (repository) {
        registerSmokeRoutes(app, {
          smokeToken,
          verifyToken: createDefaultTokenVerifier(),
          repository,
          serverVersion: serverVersion(),
        });
      } else {
        // Not registering (a 404 fails the deploy smoke) beats registering a
        // route that would "record" into memory and pass without Supabase.
        logger.error("SMOKE_TOKEN is set but Supabase is not configured — smoke route disabled");
      }
    }
    if (process.env.NODE_ENV !== "production") {
      app.use("/colyseus", monitor());
    }
  },
  greet: process.env.NODE_ENV !== "test",
});

installGracefulShutdown(server, {
  drainTimeoutMs: envNumber("DRAIN_TIMEOUT_MS", 10 * 60 * 1000),
});

const isEntrypoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntrypoint) {
  const port = Number(process.env.PORT ?? 2567);
  await server.listen(port);
  logger.info({ port }, "castle-clash server listening");
}
