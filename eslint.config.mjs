import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/lib/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/generated/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    // Scripts Node planos (no TS): no-undef de eslint:recommended necesita
    // los globals del entorno; tseslint ya los resuelve vía lib para .ts.
    files: ["**/scripts/**/*.mjs", "**/scripts/**/*.cjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
      },
    },
  },
  {
    // domain/ es lógica pura (AGENTS.md): sin Firebase, SDKs ni clientes HTTP.
    files: ["functions/src/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "firebase",
                "firebase/*",
                "firebase-admin",
                "firebase-admin/*",
                "firebase-functions",
                "firebase-functions/*",
                "@firebase/*",
                "@google-cloud/*",
                "@anthropic-ai/*",
                "@google/genai",
                "@google/genai/*",
                "@google/generative-ai",
                "googleapis",
                "googleapis/*",
                "google-auth-library",
                "axios",
                "node-fetch",
                "got",
                "undici",
                "ky",
                "superagent",
              ],
              message: "domain/ es lógica pura: sin Firebase ni SDKs",
            },
          ],
        },
      ],
    },
  },
);
