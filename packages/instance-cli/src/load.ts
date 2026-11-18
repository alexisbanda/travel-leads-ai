import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDestinationPack } from "@tla/destinations";
import { getMarketPack } from "@tla/markets";
import { InstanceConfig } from "@tla/shared";
import type { DestinationPack, InstancePacks, MarketPack } from "@tla/shared";
import { parse } from "yaml";

/** Archivo de configuración de cada instancia. */
export const INSTANCE_FILE = "instance.yaml";

/** Carpeta `instances/` del repositorio. */
export const DEFAULT_INSTANCES_DIR = fileURLToPath(new URL("../../../instances", import.meta.url));

/** Origen de los packs; en los tests se sustituye por uno ficticio. */
export interface PackRegistry {
  market(country: string): MarketPack | undefined;
  destination(country: string): DestinationPack | undefined;
}

/** Registros de `@tla/markets` y `@tla/destinations`. */
export const defaultPackRegistry: PackRegistry = {
  market: getMarketPack,
  destination: getDestinationPack,
};

/** Las carpetas que empiezan por `_` (p. ej. `_template`) son plantillas, no instancias. */
export function isTemplateName(name: string): boolean {
  return name.startsWith("_");
}

export function hasInstanceFile(dir: string): boolean {
  return existsSync(join(dir, INSTANCE_FILE));
}

/** Carpetas de `instancesDir` con `instance.yaml`, ordenadas por nombre. */
export function listInstanceDirs(instancesDir: string): string[] {
  return readdirSync(instancesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(instancesDir, entry.name))
    .filter(hasInstanceFile)
    .sort();
}

/** Problema al leer o parsear `instance.yaml`. */
export interface LoadProblem {
  kind: "read" | "yaml" | "schema";
  /** Ruta con puntos del campo, o el nombre del archivo si no hay campo. */
  path: string;
  message: string;
}

export type LoadResult =
  | { ok: true; name: string; dir: string; config: InstanceConfig }
  | { ok: false; name: string; dir: string; problems: LoadProblem[] };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Lee `<dir>/instance.yaml` y lo valida contra `InstanceConfig` (solo esquema). */
export function loadInstance(dir: string): LoadResult {
  const name = basename(dir);
  const fail = (problems: LoadProblem[]): LoadResult => ({ ok: false, name, dir, problems });

  let source: string;
  try {
    source = readFileSync(join(dir, INSTANCE_FILE), "utf8");
  } catch (error) {
    return fail([{ kind: "read", path: INSTANCE_FILE, message: errorMessage(error) }]);
  }

  let raw: unknown;
  try {
    raw = parse(source);
  } catch (error) {
    return fail([{ kind: "yaml", path: INSTANCE_FILE, message: errorMessage(error) }]);
  }

  const result = InstanceConfig.safeParse(raw);
  if (!result.success) {
    return fail(
      result.error.issues.map((issue) => ({
        kind: "schema",
        path: issue.path.length > 0 ? issue.path.join(".") : "(raíz)",
        message: issue.message,
      })),
    );
  }
  return { ok: true, name, dir, config: result.data };
}

/** Packs de mercado y destino que referencia la instancia. */
export function resolvePacks(config: InstanceConfig, registry: PackRegistry): InstancePacks {
  return {
    market: registry.market(config.market.country),
    destination: registry.destination(config.destination.country),
  };
}
