import { describe, expect, it } from "vitest";
import {
  ALLOW_LIST_ENTRY_PATH,
  desiredAuthConfig,
  diffAuthConfig,
  runAuthConfig,
  type AuthConfig,
  type AuthConfigInput,
} from "../scripts/authConfig.js";

const INPUT: AuthConfigInput = {
  clientOrigin: "https://play.example.test",
  googleClientId: "client-id.apps.googleusercontent.com",
};

const BASELINE: AuthConfig = {
  site_url: "https://play.example.test",
  uri_allow_list: "",
  external_anonymous_users_enabled: true,
  security_manual_linking_enabled: false,
  external_google_enabled: false,
  external_google_client_id: "",
  external_google_secret: "hashed-value",
  mailer_allow_unverified_email_sign_ins: false,
  external_discord_enabled: false,
  mailer_subjects_confirmation: "Confirm your signup",
  jwt_exp: 3600,
};

/** A stand-in for the Management API: GET returns the stored config, PATCH
 *  merges the sent keys into it (a true partial update) unless a test makes it
 *  misbehave. Records every request so a test can check exactly what was sent. */
function fakeApi(initial: AuthConfig, options: { clobberOnPatch?: Partial<AuthConfig> } = {}) {
  let config: AuthConfig = { ...initial };
  const requests: { method: string; url: string; auth: string | null; body: unknown }[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init?.headers);
    requests.push({ method, url: String(input), auth: headers.get("authorization"), body });
    if (method === "PATCH") {
      config = { ...config, ...body, ...options.clobberOnPatch };
    }
    return new Response(JSON.stringify(config), { status: 200 });
  };
  return { fetchFn, requests, current: () => config };
}

describe("desiredAuthConfig", () => {
  it("turns on only what linking a guest to Google needs, and keeps unverified emails off", () => {
    expect(desiredAuthConfig(INPUT, BASELINE)).toEqual({
      external_google_enabled: true,
      external_google_client_id: INPUT.googleClientId,
      external_anonymous_users_enabled: true,
      security_manual_linking_enabled: true,
      mailer_allow_unverified_email_sign_ins: false,
      uri_allow_list: `${INPUT.clientOrigin}${ALLOW_LIST_ENTRY_PATH}`,
    });
  });

  it("appends to an existing allow-list instead of replacing it", () => {
    const current = {
      ...BASELINE,
      uri_allow_list: "https://other.test/cb, https://staging.test/cb",
    };
    expect(desiredAuthConfig(INPUT, current)["uri_allow_list"]).toBe(
      `https://other.test/cb,https://staging.test/cb,${INPUT.clientOrigin}${ALLOW_LIST_ENTRY_PATH}`,
    );
  });

  it("only sends the Google secret when one was supplied", () => {
    expect("external_google_secret" in desiredAuthConfig(INPUT, BASELINE)).toBe(false);
    expect(
      desiredAuthConfig({ ...INPUT, googleClientSecret: "s3cret" }, BASELINE)[
        "external_google_secret"
      ],
    ).toBe("s3cret");
  });
});

describe("diffAuthConfig", () => {
  it("lists only keys that differ, and never reports a secret's value", () => {
    const desired = desiredAuthConfig({ ...INPUT, googleClientSecret: "s3cret" }, BASELINE);
    const changes = diffAuthConfig(BASELINE, desired);

    expect(changes.map((change) => change.key).sort()).toEqual([
      "external_google_client_id",
      "external_google_enabled",
      "external_google_secret",
      "security_manual_linking_enabled",
      "uri_allow_list",
    ]);
    const secret = changes.find((change) => change.key === "external_google_secret")!;
    expect(secret).toMatchObject({ secret: true, from: "(hidden)", to: "(hidden)" });
  });

  it("reports nothing when the project already matches", () => {
    const converged = { ...BASELINE, ...desiredAuthConfig(INPUT, BASELINE) };
    expect(diffAuthConfig(converged, desiredAuthConfig(INPUT, converged))).toEqual([]);
  });
});

describe("runAuthConfig", () => {
  const base = { projectRef: "abcdefghijklmnopqrst", token: "sbp_test", input: INPUT };

  it("is a dry run by default: reads, reports, never writes", async () => {
    const api = fakeApi(BASELINE);
    const result = await runAuthConfig({ ...base, apply: false, fetchFn: api.fetchFn });

    expect(result.applied).toBe(false);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(api.requests.map((request) => request.method)).toEqual(["GET"]);
    expect(api.requests[0]).toMatchObject({
      url: "https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/config/auth",
      auth: "Bearer sbp_test",
    });
  });

  it("applies with a PATCH holding only the changed keys, then verifies by reading back", async () => {
    const api = fakeApi(BASELINE);
    const result = await runAuthConfig({ ...base, apply: true, fetchFn: api.fetchFn });

    expect(api.requests.map((request) => request.method)).toEqual(["GET", "PATCH", "GET"]);
    const patch = api.requests[1]!.body as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual([
      "external_google_client_id",
      "external_google_enabled",
      "security_manual_linking_enabled",
      "uri_allow_list",
    ]);
    expect(result.applied).toBe(true);
    expect(api.current()["external_google_enabled"]).toBe(true);
    // Untouched settings are untouched.
    expect(api.current()["mailer_subjects_confirmation"]).toBe("Confirm your signup");
  });

  it("does not PATCH when there is nothing to change", async () => {
    const converged = { ...BASELINE, ...desiredAuthConfig(INPUT, BASELINE) };
    const api = fakeApi(converged);
    const result = await runAuthConfig({ ...base, apply: true, fetchFn: api.fetchFn });

    expect(result.changes).toEqual([]);
    expect(api.requests.map((request) => request.method)).toEqual(["GET"]);
  });

  it("fails loudly if the API changed a setting it was not asked to change", async () => {
    const api = fakeApi(BASELINE, { clobberOnPatch: { mailer_subjects_confirmation: "" } });

    await expect(runAuthConfig({ ...base, apply: true, fetchFn: api.fetchFn })).rejects.toThrow(
      /mailer_subjects_confirmation/,
    );
  });

  it("fails if a requested value did not stick", async () => {
    const api = fakeApi(BASELINE, { clobberOnPatch: { security_manual_linking_enabled: false } });

    await expect(runAuthConfig({ ...base, apply: true, fetchFn: api.fetchFn })).rejects.toThrow(
      /security_manual_linking_enabled/,
    );
  });

  it("warns when site_url is not the client origin, but does not change it", async () => {
    const api = fakeApi({ ...BASELINE, site_url: "https://elsewhere.test" });
    const result = await runAuthConfig({ ...base, apply: false, fetchFn: api.fetchFn });

    expect(result.warnings.join(" ")).toMatch(/site_url/);
    expect(result.changes.map((change) => change.key)).not.toContain("site_url");
  });

  it("names the failing status without echoing the token", async () => {
    const fetchFn: typeof fetch = async () => new Response("nope", { status: 401 });

    const failure = runAuthConfig({ ...base, apply: false, fetchFn });
    await expect(failure).rejects.toThrow(/401/);
    await expect(failure).rejects.not.toThrow(/sbp_test/);
  });
});
