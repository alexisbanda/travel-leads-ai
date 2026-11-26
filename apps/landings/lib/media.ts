import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Comprobación de medios de la instancia (`hero.media.src`/`poster`,
 * `brand.logo`): cada referencia `/media/<ruta>` debe existir en
 * `instances/<id>/content/media/<ruta>` (ver script `scripts/sync-media.mjs`
 * que la copia a `public/media`). Las URLs absolutas `https://` no se
 * comprueban.
 */

const MEDIA_PREFIX = "/media/";

/** Carpeta `instances/<id>/content/media` por defecto, anclada a la raíz del repositorio. */
export function defaultMediaDir(instanceId: string): string {
  return fileURLToPath(new URL(`../../../instances/${instanceId}/content/media`, import.meta.url));
}

export interface MediaRef {
  /** Valor tal como aparece en el contenido: `/media/...` o una URL `https://`. */
  ref: string;
  /** Dónde se usa, para el mensaje de error o aviso (p. ej. `landing ejemplo (hero.media.src)`). */
  context: string;
}

export interface CheckMediaOptions {
  /** `instances/<id>/content/media` resuelto. */
  mediaDir: string;
  /** `true` si la instancia está en `status: draft`. */
  isDraft: boolean;
  /** Por defecto, `console.warn`. */
  warn?: (message: string) => void;
}

/** Ruta relativa a `mediaDir`; lanza si el ref no empieza por `/media/` o contiene `..`. */
function relativeMediaPath(ref: string): string {
  if (!ref.startsWith(MEDIA_PREFIX)) {
    throw new Error(
      `apps/landings: ref de medio inválido "${ref}" (debe empezar por "${MEDIA_PREFIX}" o ser una URL "https://")`,
    );
  }
  const rel = ref.slice(MEDIA_PREFIX.length);
  if (rel.split("/").some((part) => part === "..")) {
    throw new Error(`apps/landings: ref de medio inválido "${ref}" (no se permite ".." en la ruta)`);
  }
  return rel;
}

/**
 * Comprueba cada ref de `refs` contra `mediaDir`. Devuelve el subconjunto de
 * refs usables (existe el archivo o es una URL absoluta `https://`). Un ref
 * con formato inválido (sin `/media/`, o con `..`) siempre lanza. Si el
 * archivo local no existe: fuera de draft lanza un error que nombra el
 * archivo y el contexto (hace fallar el build); en draft llama a `warn` y
 * descarta el ref del resultado.
 */
export function checkMedia(refs: readonly MediaRef[], options: CheckMediaOptions): Set<string> {
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const available = new Set<string>();
  for (const { ref, context } of refs) {
    if (/^https?:\/\//.test(ref)) {
      available.add(ref);
      continue;
    }
    const rel = relativeMediaPath(ref);
    const path = join(options.mediaDir, rel);
    if (existsSync(path)) {
      available.add(ref);
      continue;
    }
    const message = `apps/landings: falta el archivo de medio "${ref}" usado en ${context} (${path})`;
    if (options.isDraft) {
      warn(message);
    } else {
      throw new Error(message);
    }
  }
  return available;
}
