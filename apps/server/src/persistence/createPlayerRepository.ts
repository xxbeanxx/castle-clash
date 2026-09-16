import type { Database } from "@castle-clash/shared";
import { createClient } from "@supabase/supabase-js";
import { InMemoryPlayerRepository } from "./InMemoryPlayerRepository.js";
import type { PlayerRepository } from "./PlayerRepository.js";
import { SupabasePlayerRepository } from "./SupabasePlayerRepository.js";

/**
 * Builds the real, production `PlayerRepository` from `SUPABASE_URL`/
 * `SUPABASE_SECRET_KEY` — or, if either is unset, falls back to a fresh
 * `InMemoryPlayerRepository` with a warning, the same way `pnpm dev` has
 * always worked without any other external service configured. This keeps
 * local dev unblocked for anyone who hasn't run `pnpm exec supabase start`
 * yet; a deployed server (container env, `compose.yaml`, CI's
 * `integration.yml`) always sets both, so it always gets the real
 * implementation. Called lazily per room (`MatchRoom.onCreate`), not once
 * at module load, so importing this file never requires the env vars to be
 * set. */
export function createDefaultPlayerRepository(): PlayerRepository {
  const url = process.env["SUPABASE_URL"];
  const secretKey = process.env["SUPABASE_SECRET_KEY"];

  if (!url || !secretKey) {
    console.warn(
      "[createDefaultPlayerRepository] SUPABASE_URL/SUPABASE_SECRET_KEY not set — " +
        "falling back to InMemoryPlayerRepository (loadouts/match history will not persist).",
    );
    return new InMemoryPlayerRepository();
  }

  return new SupabasePlayerRepository(createClient<Database>(url, secretKey));
}
