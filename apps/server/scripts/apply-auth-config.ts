import { runAuthConfig } from "./authConfig.js";

/**
 * `pnpm --filter @castle-clash/server run auth-config [-- --apply]`
 *
 * Dry run by default: prints what would change on the hosted Supabase project's auth
 * settings and exits 0 when it is already correct, 2 when it is not. `--apply` writes it.
 * Run by hand (or by `scripts/setup-google-login.sh`'s wizard) — production settings are
 * never changed by CI. See docs/hosting.md, "Google sign-in".
 *
 * Environment: SUPABASE_ACCESS_TOKEN (personal access token), SUPABASE_PROJECT_REF,
 * CLIENT_ORIGIN, GOOGLE_CLIENT_ID, and GOOGLE_CLIENT_SECRET when setting or rotating it.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];

  const result = await runAuthConfig({
    projectRef: requireEnv("SUPABASE_PROJECT_REF"),
    token: requireEnv("SUPABASE_ACCESS_TOKEN"),
    input: {
      clientOrigin: requireEnv("CLIENT_ORIGIN").replace(/\/+$/, ""),
      googleClientId: requireEnv("GOOGLE_CLIENT_ID"),
      ...(clientSecret ? { googleClientSecret: clientSecret } : {}),
    },
    apply,
  });

  for (const warning of result.warnings) {
    console.warn(`auth-config: warning: ${warning}`);
  }
  if (result.changes.length === 0) {
    console.log("auth-config: the project already matches; nothing to change");
    return;
  }
  for (const change of result.changes) {
    console.log(
      `auth-config: ${change.key}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`,
    );
  }
  if (result.applied) {
    console.log("auth-config: applied and verified");
  } else {
    console.log("auth-config: dry run — re-run with --apply to write these changes");
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error("auth-config: FAILED", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
