import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/build/**", "**/.turbo/**", "**/node_modules/**"],
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
  prettierConfig,
);
