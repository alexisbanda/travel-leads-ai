#!/usr/bin/env node
// Copia `instances/<id>/content/media/` a `apps/landings/public/media/` para
// que Next sirva los medios de la instancia (hero, logo). `<id>` sale de
// `INSTANCE` o, si no está, del `id` de `generated/instance.json`. Sin
// carpeta de medios en la instancia, deja `public/media` vacío (no falla).

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");

/** Id de instancia: `INSTANCE` o, si falta, el `id` de `generated/instance.json`. */
export function resolveInstanceId(env = process.env, repoRoot = REPO_ROOT) {
  if (env.INSTANCE && env.INSTANCE !== "") return env.INSTANCE;
  const resolvedPath = join(repoRoot, "generated", "instance.json");
  if (!existsSync(resolvedPath)) return undefined;
  const resolved = JSON.parse(readFileSync(resolvedPath, "utf8"));
  return resolved.id;
}

/**
 * Copia `<repoRoot>/instances/<instanceId>/content/media` a `targetDir`,
 * borrando antes `targetDir`. Sin carpeta de origen, deja `targetDir` vacío.
 */
export function syncMedia({ instanceId, repoRoot = REPO_ROOT, targetDir = join(HERE, "..", "public", "media") }) {
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  if (!instanceId) return;
  const sourceDir = join(repoRoot, "instances", instanceId, "content", "media");
  if (!existsSync(sourceDir)) return;
  cpSync(sourceDir, targetDir, { recursive: true });
}

function main() {
  const instanceId = resolveInstanceId();
  syncMedia({ instanceId });
}

// Solo ejecuta si se invoca directamente (no al importar las funciones en tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
