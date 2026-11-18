import { realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveInstance, type ResolvedInstanceConfig } from "@tla/shared";
import {
  hasInstanceFile,
  INSTANCE_FILE,
  isTemplateName,
  loadInstance,
  resolvePacks,
  type PackRegistry,
} from "./load.js";
import type { ValidationIssue } from "./validate.js";

/** Raíz del repositorio. */
export const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** Ids de carpeta admitidos (evita rutas como `../`). */
const FOLDER_NAME = /^[A-Za-z0-9_-]+$/;

export type ResolveByIdResult =
  | { ok: true; config: ResolvedInstanceConfig }
  | { ok: false; error: string }
  | { ok: false; issues: ValidationIssue[] };

/**
 * Carga `instances/<id>`, comprueba que no sea una plantilla y que el `id`
 * coincida con la carpeta, y la resuelve con sus packs en memoria.
 */
export function resolveInstanceById(
  id: string,
  instancesDir: string,
  registry: PackRegistry,
): ResolveByIdResult {
  if (isTemplateName(id)) {
    return { ok: false, error: `«${id}» es una plantilla, no una instancia` };
  }
  const dir = join(instancesDir, id);
  if (!FOLDER_NAME.test(id) || !hasInstanceFile(dir)) {
    return {
      ok: false,
      error: `no existe la instancia «${id}» (instances/${id}/${INSTANCE_FILE})`,
    };
  }
  const loaded = loadInstance(dir);
  if (!loaded.ok) {
    return {
      ok: false,
      issues: loaded.problems.map(({ kind, path, message }) => ({ rule: kind, path, message })),
    };
  }
  if (loaded.config.id !== id) {
    return {
      ok: false,
      issues: [
        {
          rule: "instance-id",
          path: "id",
          message: `el id «${loaded.config.id}» no coincide con el nombre de la carpeta «${id}»`,
        },
      ],
    };
  }
  const result = resolveInstance(loaded.config, resolvePacks(loaded.config, registry));
  return result.ok ? { ok: true, config: result.config } : { ok: false, issues: result.issues };
}

/** `true` si el módulo `url` es el script que ejecuta Node. */
export function isEntryPoint(url: string): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(url));
  } catch {
    return false;
  }
}

/** Quita el `--` que pnpm puede dejar delante de los argumentos. */
export function stripDashDash(argv: string[]): string[] {
  return argv[0] === "--" ? argv.slice(1) : argv;
}
