import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { LandingContent } from "@tla/shared";

/** Carpeta de contenido de landings dentro de una instancia. */
export const LANDINGS_DIR = "content/landings";

/** Un archivo de contenido de landing ya leído (o que no se pudo leer/parsear) del disco. */
export type LandingFileInput =
  | { file: string; json: unknown }
  | { file: string; error: string };

/** Incumplimiento al validar el contenido de landings de una instancia. */
export interface LandingContentIssue {
  /** `<archivo>: <ruta del campo>` (p. ej. `content/landings/x.json: seo.title`). */
  path: string;
  message: string;
}

/**
 * Valida una lista de archivos de contenido de landing ya leídos: forma
 * (`LandingContent`), que `slug` coincida con el nombre del archivo y que no
 * colisione con el slug de una página legal (`legalSlugs`). Lógica pura, sin
 * acceso a disco, para poder probarla con fixtures en memoria.
 */
export function validateLandingFiles(
  files: readonly LandingFileInput[],
  legalSlugs: readonly string[],
): LandingContentIssue[] {
  const issues: LandingContentIssue[] = [];
  for (const input of files) {
    if ("error" in input) {
      issues.push({ path: `${input.file}: (raíz)`, message: input.error });
      continue;
    }
    const result = LandingContent.safeParse(input.json);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path.length > 0 ? issue.path.join(".") : "(raíz)";
        issues.push({ path: `${input.file}: ${field}`, message: issue.message });
      }
      continue;
    }
    const expectedSlug = basename(input.file, ".json");
    if (result.data.slug !== expectedSlug) {
      issues.push({
        path: `${input.file}: slug`,
        message: `el slug «${result.data.slug}» no coincide con el nombre del archivo (esperado «${expectedSlug}»)`,
      });
    }
    if (legalSlugs.includes(result.data.slug)) {
      issues.push({
        path: `${input.file}: slug`,
        message: `colisiona con el slug de una página legal: ${result.data.slug}`,
      });
    }
  }
  return issues;
}

/**
 * Lee los JSON de `<instanceDir>/content/landings` (si existe la carpeta),
 * sin validarlos todavía: pasa el resultado a `validateLandingFiles`.
 */
export function readLandingFiles(instanceDir: string): LandingFileInput[] {
  const dir = join(instanceDir, LANDINGS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry): LandingFileInput => {
      const file = `${LANDINGS_DIR}/${entry.name}`;
      let raw: string;
      try {
        raw = readFileSync(join(dir, entry.name), "utf8");
      } catch (error) {
        return { file, error: error instanceof Error ? error.message : String(error) };
      }
      try {
        return { file, json: JSON.parse(raw) };
      } catch (error) {
        return {
          file,
          error: `JSON inválido: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    });
}
