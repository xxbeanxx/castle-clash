import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  // `packages/shared`'s tsconfig sets `types: []` (no Node globals in the
  // isomorphic source), so property tests can't read `process.env.FC_SEED`
  // directly — it's injected as a build-time constant here instead, from
  // this Node-context config file, not from `src`.
  define: {
    __FC_SEED__: JSON.stringify(process.env.FC_SEED ?? ""),
  },
});
