-- Phase 8: extensions this schema depends on.
--
-- `citext` backs `profiles.display_name`'s case-insensitive uniqueness (plan
-- step 2). `pgtap` isn't enabled by `supabase start` just because the stack
-- comes up (it ships in the image but is opt-in per project, per
-- docs/research/phase8-supabase-cli-podman.md §8) — enabling it here means
-- `supabase/tests/*.test.sql` can run against any environment that applies
-- these migrations from scratch, not just this one local stack.
create extension if not exists citext with schema extensions;
create extension if not exists pgtap with schema extensions;
