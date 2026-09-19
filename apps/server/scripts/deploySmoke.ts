/**
 * The post-deploy smoke (plan Phase 10 testing strategy, "deploy smoke"): a
 * short, ordered list of checks a pipeline runs against a freshly deployed
 * environment. Each step throws on failure, so the first broken thing ends
 * the run with a message naming it. Every network dependency is a plain
 * `fetch` against the URLs in `DeploySmokeConfig`, so the same code checks
 * staging, production, or a local stack.
 */

export interface DeploySmokeConfig {
  /** `ws(s)://` origin of the Colyseus server; its HTTP twin serves /healthz. */
  readonly gameServerUrl: string;
  readonly clientUrl: string;
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
  /** Must equal the server's `SMOKE_TOKEN`. */
  readonly smokeToken: string;
  /** When set, `/healthz` must report exactly this `SERVER_VERSION` — the
   *  check that the release just deployed is the one now serving. */
  readonly expectedVersion: string | undefined;
  /** Joins a private room as the given user and leaves again. Injected so the
   *  unit tests don't need a Colyseus server; the CLI passes the real one. */
  readonly joinAndLeave: (gameServerUrl: string, accessToken: string) => Promise<void>;
  /** A scale-from-zero container's first request can take several seconds. */
  readonly attempts: number;
  readonly retryDelayMs: number;
}

export interface StepResult {
  readonly name: string;
  readonly ok: boolean;
}

function httpOrigin(wsUrl: string): string {
  return wsUrl.replace(/^ws(s?):\/\//, "http$1://").replace(/\/$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GET (or any request) retried until it answers 2xx, so a container that is
 *  still starting doesn't fail the run — but a real 4xx/5xx that persists does. */
async function fetchOk(
  config: DeploySmokeConfig,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= config.attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`${url} answered ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < config.attempts) {
      await sleep(config.retryDelayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function runDeploySmoke(config: DeploySmokeConfig): Promise<StepResult[]> {
  const results: StepResult[] = [];
  const gameHttp = httpOrigin(config.gameServerUrl);
  let accessToken = "";
  let reportedVersion: string | undefined;

  const steps: Array<[string, () => Promise<void>]> = [
    [
      "server /healthz",
      async () => {
        const body = (await (await fetchOk(config, `${gameHttp}/healthz`)).json()) as {
          version?: string;
        };
        reportedVersion = body.version;
        // A release tag (`v1.2.3`) and the server's own `1.2.3` name the same version.
        const expected = config.expectedVersion?.replace(/^v/, "");
        if (expected !== undefined && body.version !== expected) {
          throw new Error(`server reports version ${String(body.version)}, expected ${expected}`);
        }
      },
    ],
    [
      "server /readyz",
      async () => {
        await fetchOk(config, `${gameHttp}/readyz`);
      },
    ],
    [
      "client loads",
      async () => {
        const html = await (await fetchOk(config, `${config.clientUrl}/`)).text();
        // React Router's SPA-mode index.html is a shell (title + module preloads, no
        // `<div>`: React renders the root itself), so identify the app by its title.
        // That rejects Azure's placeholder page, an nginx default page and error pages.
        if (!html.includes("<title>Castle Clash</title>")) {
          throw new Error(
            "client index.html is not the Castle Clash app (no <title>Castle Clash</title>)",
          );
        }
      },
    ],
    [
      "client config points at the game server",
      async () => {
        const script = await (await fetchOk(config, `${config.clientUrl}/config.js`)).text();
        const expected = new URL(gameHttp).host;
        if (!script.includes(expected)) {
          throw new Error(`client config.js does not reference the game server host ${expected}`);
        }
      },
    ],
    [
      "anonymous sign-in",
      async () => {
        const response = await fetchOk(config, `${config.supabaseUrl}/auth/v1/signup`, {
          method: "POST",
          headers: { apikey: config.supabasePublishableKey, "Content-Type": "application/json" },
          body: "{}",
        });
        accessToken = ((await response.json()) as { access_token: string }).access_token;
      },
    ],
    [
      "join and leave a private room",
      async () => {
        await config.joinAndLeave(config.gameServerUrl, accessToken);
      },
    ],
    [
      "smoke match write",
      async () => {
        const response = await fetch(`${gameHttp}/smoke/record-match`, {
          method: "POST",
          headers: { "x-smoke-token": config.smokeToken, authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) {
          throw new Error(`POST /smoke/record-match answered ${response.status}`);
        }
        const body = (await response.json()) as { serverVersion?: string };
        if (reportedVersion !== undefined && body.serverVersion !== reportedVersion) {
          throw new Error(
            `write path served by ${String(body.serverVersion)}, /healthz said ${reportedVersion}`,
          );
        }
      },
    ],
  ];

  for (const [name, run] of steps) {
    try {
      await run();
      results.push({ name, ok: true });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`deploy smoke failed at "${name}": ${reason}`, { cause: error });
    }
  }
  return results;
}
