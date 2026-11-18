import { fileURLToPath } from "node:url";
import { readResolvedInstance, type ResolvedInstanceConfig } from "@tla/shared";

/** Variable de entorno con la ruta de la configuración resuelta (tiene prioridad). */
export const INSTANCE_CONFIG_ENV = "TLA_INSTANCE_CONFIG";

/** `generated/instance.json` en la raíz del repositorio (relativa a este archivo, en `src/` o en `lib/`). */
export const DEFAULT_INSTANCE_CONFIG_PATH = fileURLToPath(
  new URL("../../generated/instance.json", import.meta.url),
);

/** Ruta de la configuración resuelta: `TLA_INSTANCE_CONFIG` o `generated/instance.json`. */
export function instanceConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[INSTANCE_CONFIG_ENV];
  return fromEnv !== undefined && fromEnv !== "" ? fromEnv : DEFAULT_INSTANCE_CONFIG_PATH;
}

/**
 * Configuración resuelta de la instancia (`pnpm instance:build <id>`).
 * Lanza un error claro si falta el archivo o no es válido.
 */
export function loadInstanceConfig(path: string = instanceConfigPath()): ResolvedInstanceConfig {
  return readResolvedInstance(path);
}
