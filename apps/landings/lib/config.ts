import { fileURLToPath } from "node:url";
import { readResolvedInstance, RESOLVED_INSTANCE_FILE, type ResolvedInstanceConfig } from "@tla/shared";

/**
 * Ruta por defecto de la configuración resuelta, anclada a la raíz del
 * repositorio (no al `cwd` del proceso que ejecuta `next dev`/`next build`).
 */
export const DEFAULT_RESOLVED_PATH = fileURLToPath(
  new URL(`../../../${RESOLVED_INSTANCE_FILE}`, import.meta.url),
);

export interface LandingsConfig {
  instance: ResolvedInstanceConfig;
  /** `true` si la instancia está en `status: draft`: se relajan los obligatorios y se publican landings `draft`. */
  isDraft: boolean;
}

export interface LoadLandingsConfigOptions {
  /** Ruta al `generated/instance.json` a leer (por defecto, el de la raíz del repo). */
  resolvedPath?: string;
  /** Valor de la variable de entorno `INSTANCE` (por defecto, `process.env.INSTANCE`). */
  instanceEnv?: string;
}

/** Campos obligatorios de la configuración resuelta fuera de `draft`. */
const REQUIRED_OUTSIDE_DRAFT: ReadonlyArray<{
  path: string;
  value: (instance: ResolvedInstanceConfig) => string;
}> = [
  { path: "brand.displayName", value: (instance) => instance.brand.displayName },
  { path: "brand.domain", value: (instance) => instance.brand.domain },
  { path: "channels.whatsapp.number", value: (instance) => instance.channels.whatsapp.number },
];

/**
 * Carga y valida `generated/instance.json`. Lanza un error claro si falta el
 * archivo, si `INSTANCE` no coincide con la instancia resuelta, o si faltan
 * valores obligatorios fuera de `draft`. En `draft`, avisa por consola y
 * marca `isDraft: true` en vez de fallar.
 */
export function loadLandingsConfig(options: LoadLandingsConfigOptions = {}): LandingsConfig {
  const resolvedPath = options.resolvedPath ?? DEFAULT_RESOLVED_PATH;
  const instanceEnv = options.instanceEnv ?? process.env.INSTANCE;

  // readResolvedInstance ya incluye "ejecuta `pnpm instance:build <id>`" si falta el archivo.
  const instance = readResolvedInstance(resolvedPath);

  if (instanceEnv !== undefined && instanceEnv !== "" && instanceEnv !== instance.id) {
    throw new Error(
      `apps/landings: INSTANCE=${instanceEnv} no coincide con la instancia resuelta (${instance.id}); ` +
        "ejecuta `pnpm instance:build <id>` con el id correcto antes de construir.",
    );
  }

  if (instance.status === "draft") {
    console.warn(
      `apps/landings: la instancia ${instance.id} está en draft (pueden faltar valores obligatorios y se publican también las landings marcadas draft).`,
    );
    return { instance, isDraft: true };
  }

  const missing = REQUIRED_OUTSIDE_DRAFT.filter(({ value }) => value(instance).trim() === "").map(
    ({ path }) => path,
  );
  if (missing.length > 0) {
    throw new Error(
      `apps/landings: faltan valores obligatorios fuera de draft en ${instance.id}: ${missing.join(", ")}`,
    );
  }
  return { instance, isDraft: false };
}
