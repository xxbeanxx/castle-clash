import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: [
    "**/dist/**",
    "**/build/**",
    "**/.turbo/**",
    "**/node_modules/**",
    "**/.react-router/**",
  ],
  plugins: ["typescript", "react"],
  overrides: [
    {
      files: ["packages/shared/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@castle-clash/server",
                message: "shared must stay isomorphic; it cannot depend on server.",
              },
              {
                name: "@castle-clash/client",
                message: "shared must stay isomorphic; it cannot depend on client.",
              },
              {
                name: "pixi.js",
                message: "shared must stay isomorphic; it cannot depend on pixi.js.",
              },
              { name: "react", message: "shared must stay isomorphic; it cannot depend on react." },
            ],
            patterns: [
              {
                group: ["@supabase/*"],
                message: "shared must stay isomorphic; it cannot depend on Supabase.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["apps/client/app/**/*.{ts,tsx}"],
      rules: {
        "react/rules-of-hooks": "error",
        "react/exhaustive-deps": "warn",
      },
    },
    {
      files: ["apps/client/app/game/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "react",
                message: "app/game must stay React-free; it runs Pixi imperatively.",
              },
            ],
          },
        ],
      },
    },
  ],
});
