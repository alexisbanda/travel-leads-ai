import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LandingContent } from "@tla/shared";

/** Carpeta `instances/<id>/content/landings` por defecto, anclada a la raíz del repositorio. */
export function defaultLandingsDir(instanceId: string): string {
  return fileURLToPath(
    new URL(`../../../instances/${instanceId}/content/landings`, import.meta.url),
  );
}

export interface LoadLandingsOptions {
  /** Carpeta a leer (por defecto, `instances/<instanceId>/content/landings`). */
  dir?: string;
  /** Incluye también las landings marcadas `draft: true` (instancia en `draft`). */
  includeDrafts: boolean;
}

function parseLanding(file: string, json: unknown): LandingContent {
  const result = LandingContent.safeParse(json);
  if (result.success) return result.data;
  const fields = result.error.issues.map(
    (issue) => `  ${issue.path.length > 0 ? issue.path.join(".") : "(raíz)"}: ${issue.message}`,
  );
  throw new Error([`${file} no es un LandingContent válido:`, ...fields].join("\n"));
}

/**
 * Lee y valida el contenido de landings de una instancia. Si la carpeta no
 * existe, devuelve `[]`. Las landings `draft: true` solo se incluyen cuando
 * `includeDrafts` es `true` (instancia en `status: draft`).
 */
export function loadLandings(instanceId: string, options: LoadLandingsOptions): LandingContent[] {
  const dir = options.dir ?? defaultLandingsDir(instanceId);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  const landings: LandingContent[] = [];
  for (const name of files) {
    const raw = readFileSync(join(dir, name), "utf8");
    const landing = parseLanding(`content/landings/${name}`, JSON.parse(raw));
    if (!landing.draft || options.includeDrafts) landings.push(landing);
  }
  return landings;
}
