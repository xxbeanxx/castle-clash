import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { runDeploySmoke, type DeploySmokeConfig } from "../scripts/deploySmoke.js";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const servers: Server[] = [];

async function listen(handler: Handler): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** What `react-router build` (SPA mode) actually emits: a shell with the title and
 *  module preloads, and no `<div>` — React renders the root itself. */
const SPA_SHELL =
  '<!DOCTYPE html><html lang="en"><head><title>Castle Clash</title>' +
  '<link rel="modulepreload" href="/assets/entry.client-abc.js"/></head><body></body></html>';

interface Fakes {
  gameUrl: string;
  clientUrl: string;
  supabaseUrl: string;
  smokeCalls: Array<{ smokeToken?: string; authorization?: string }>;
  joins: string[];
}

async function startFakes(
  overrides: {
    serverVersion?: string;
    recordStatus?: number;
    configGameUrl?: string;
    clientHtml?: string;
  } = {},
): Promise<Fakes> {
  const smokeCalls: Fakes["smokeCalls"] = [];
  const joins: string[] = [];
  const version = overrides.serverVersion ?? "1.2.3";

  const gameUrl = await listen((req, res) => {
    if (req.url === "/healthz") {
      return json(res, 200, { status: "ok", version });
    }
    if (req.url === "/readyz") {
      return json(res, 200, { status: "ready" });
    }
    if (req.url === "/smoke/record-match" && req.method === "POST") {
      smokeCalls.push({
        smokeToken: req.headers["x-smoke-token"] as string | undefined,
        authorization: req.headers["authorization"],
      });
      return json(res, overrides.recordStatus ?? 200, { matchId: "m-1", serverVersion: version });
    }
    return json(res, 404, {});
  });

  const clientUrl = await listen((req, res) => {
    if (req.url === "/config.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(`window.__CONFIG__ = { GAME_SERVER_URL: "${overrides.configGameUrl ?? gameUrl}" };`);
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(overrides.clientHtml ?? SPA_SHELL);
  });

  const supabaseUrl = await listen((req, res) => {
    if (req.url === "/auth/v1/signup" && req.method === "POST") {
      return json(res, 200, { access_token: "anon-jwt" });
    }
    return json(res, 404, {});
  });

  return { gameUrl, clientUrl, supabaseUrl, smokeCalls, joins };
}

function configFor(fakes: Fakes, extra: Partial<DeploySmokeConfig> = {}): DeploySmokeConfig {
  return {
    gameServerUrl: fakes.gameUrl.replace("http://", "ws://"),
    clientUrl: fakes.clientUrl,
    supabaseUrl: fakes.supabaseUrl,
    supabasePublishableKey: "publishable",
    smokeToken: "tok",
    expectedVersion: undefined,
    joinAndLeave: async (_gameUrl, accessToken) => {
      fakes.joins.push(accessToken);
    },
    retryDelayMs: 1,
    attempts: 2,
    ...extra,
  };
}

describe("runDeploySmoke", () => {
  it("passes against a healthy deployment, running every step in order", async () => {
    const fakes = await startFakes();
    const results = await runDeploySmoke(configFor(fakes, { expectedVersion: "1.2.3" }));

    expect(results.map((r) => r.name)).toEqual([
      "server /healthz",
      "server /readyz",
      "client loads",
      "client config points at the game server",
      "anonymous sign-in",
      "join and leave a private room",
      "smoke match write",
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(fakes.joins).toEqual(["anon-jwt"]);
    expect(fakes.smokeCalls).toEqual([{ smokeToken: "tok", authorization: "Bearer anon-jwt" }]);
  });

  it("accepts a release tag with its leading v as the expected version", async () => {
    const fakes = await startFakes({ serverVersion: "1.2.3" });
    const results = await runDeploySmoke(configFor(fakes, { expectedVersion: "v1.2.3" }));
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("fails when the live server reports a different version than the release just deployed", async () => {
    const fakes = await startFakes({ serverVersion: "1.2.2" });
    await expect(runDeploySmoke(configFor(fakes, { expectedVersion: "1.2.3" }))).rejects.toThrow(
      /version.*1\.2\.2.*1\.2\.3/s,
    );
  });

  it("fails when the client URL serves something other than the app (a placeholder or error page)", async () => {
    const fakes = await startFakes({
      clientHtml:
        "<html><head><title>Welcome to nginx!</title></head><body><div>hi</div></body></html>",
    });
    await expect(runDeploySmoke(configFor(fakes))).rejects.toThrow(/client loads.*Castle Clash/s);
  });

  it("fails when the client's runtime config points at a different game server", async () => {
    const fakes = await startFakes({ configGameUrl: "wss://some-other-host.example" });
    await expect(runDeploySmoke(configFor(fakes))).rejects.toThrow(/config/i);
  });

  it("fails when the smoke match write is rejected", async () => {
    const fakes = await startFakes({ recordStatus: 502 });
    await expect(runDeploySmoke(configFor(fakes))).rejects.toThrow(/smoke match write.*502/s);
  });

  it("retries a slow-to-start endpoint (scale-from-zero) before giving up", async () => {
    let hits = 0;
    const gameUrl = await listen((req, res) => {
      if (req.url === "/healthz") {
        hits += 1;
        return hits < 2 ? json(res, 503, {}) : json(res, 200, { status: "ok", version: "1.0.0" });
      }
      return json(res, 200, { status: "ready" });
    });
    const fakes = await startFakes();
    // The fake client's config.js names the *other* game server, so the run
    // still fails later at the config step — what matters is that /healthz
    // was retried past its first 503 rather than failing the run on it.
    await expect(runDeploySmoke(configFor({ ...fakes, gameUrl }, { attempts: 3 }))).rejects.toThrow(
      /config/i,
    );
    expect(hits).toBe(2);
  });
});
