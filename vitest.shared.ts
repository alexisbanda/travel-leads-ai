import { defineConfig } from "vitest/config";

/**
 * Config compartida para paquetes que consumen @tla/shared (y entre sí) sin
 * compilar: fuerza la condición de exports "source" para que vitest resuelva
 * src/index.ts en lugar de dist/index.js (que puede no existir en local/CI
 * antes de `pnpm build`). Ver packages/shared/package.json#exports.
 */
export default defineConfig({
  resolve: {
    conditions: ["source"],
  },
  ssr: {
    resolve: {
      conditions: ["source"],
    },
  },
});
