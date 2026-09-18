import type { Database } from "@castle-clash/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe } from "vitest";
import { SupabasePlayerRepository } from "../../src/persistence/SupabasePlayerRepository.js";
import { runPlayerRepositoryContractTests } from "./PlayerRepository.contract.js";

/**
 * Runs the shared `PlayerRepository` contract against a real local Supabase
 * instance (plan Phase 8 testing strategy). Skipped unless `SUPABASE_URL`/
 * `SUPABASE_SECRET_KEY` are set — unit CI never sets them (it doesn't start
 * Supabase at all), so this file contributes zero tests there rather than
 * failing; `.github/workflows/integration.yml` sets them to the CLI-started
 * local stack's own printed values before running the suite.
 */
const canRunAgainstSupabase = Boolean(
  process.env["SUPABASE_URL"] && process.env["SUPABASE_SECRET_KEY"],
);

describe.skipIf(!canRunAgainstSupabase)("SupabasePlayerRepository contract", () => {
  let client: SupabaseClient<Database>;
  // Pre-seeded so `makeUserId()` (called synchronously from inside each
  // contract test) never has to await an insert itself — every id this
  // suite could possibly need already exists as a real `auth.users` row
  // (and, via the `on_auth_user_created` trigger, a `profiles` row) by the
  // time any test runs.
  let userIdPool: string[] = [];

  beforeAll(async () => {
    client = createClient<Database>(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_SECRET_KEY"]!,
    );

    const ids = Array.from({ length: 12 }, () => crypto.randomUUID());
    for (const id of ids) {
      const { error } = await client.auth.admin.createUser({
        id,
        email: `${id}@contract-test.invalid`,
      });
      if (error) {
        throw new Error(`failed to seed auth.users(${id}): ${error.message}`);
      }
    }
    userIdPool = ids;
  });

  runPlayerRepositoryContractTests(
    () => new SupabasePlayerRepository(client),
    () => {
      const id = userIdPool.shift();
      if (!id) {
        throw new Error("SupabasePlayerRepository contract test ran out of pre-seeded user ids");
      }
      return id;
    },
  );
});
