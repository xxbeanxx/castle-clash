import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // Room integration tests each `boot()` a real Colyseus server on a fixed
    // port (@colyseus/testing's `boot()` ignores its `port` argument when
    // given a raw `Server` instance, as `apps/server/src/index.ts` exports) —
    // running test files in parallel means two of them bind the same port.
    fileParallelism: false,
  },
});
