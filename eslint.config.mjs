import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import nextPlugin from "@next/eslint-plugin-next";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/lib/**",
      // apps/landings/lib es código fuente (ver apps/landings/.gitignore),
      // no una salida de build como functions/lib: no lo ignores.
      "!apps/landings/lib/**",
      "**/dist/**",
      "**/.next/**",
      "**/next-env.d.ts",
      "**/coverage/**",
      "**/generated/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    // Permite el patrón `const { campo, ...resto } = obj` para omitir
    // `campo` (p. ej. en fixtures de test) prefijándolo con `_`.
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^_" }],
    },
  },
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
    // Presupuesto de rendimiento (docs/04-landings.md#rendimiento): reglas de
    // @next/eslint-plugin-next sobre apps/landings (único consumidor de Next
    // en el repo). Next detecta el plugin vía settings.next.rootDir.
    files: ["apps/landings/**/*.{ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.flatConfig.recommended.rules,
      ...nextPlugin.flatConfig.coreWebVitals.rules,
      "@next/next/no-img-element": "error",
    },
    settings: {
      next: {
        rootDir: "apps/landings",
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
