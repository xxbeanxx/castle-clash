import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["app/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    exclude: ["**/node_modules/**", "**/*.browser.test.ts"],
  },
});
