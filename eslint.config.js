import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.turbo/**",
      "**/node_modules/**",
      "**/.react-router/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ["packages/shared/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@castle-clash/server", message: "shared must stay isomorphic; it cannot depend on server." },
            { name: "@castle-clash/client", message: "shared must stay isomorphic; it cannot depend on client." },
            { name: "pixi.js", message: "shared must stay isomorphic; it cannot depend on pixi.js." },
            { name: "react", message: "shared must stay isomorphic; it cannot depend on react." },
          ],
          patterns: [{ group: ["@supabase/*"], message: "shared must stay isomorphic; it cannot depend on Supabase." }],
        },
      ],
    },
  },
  {
    files: ["apps/client/app/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ["apps/client/app/game/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "react", message: "app/game must stay React-free; it runs Pixi imperatively." }],
        },
      ],
    },
  },
  prettierConfig,
);
