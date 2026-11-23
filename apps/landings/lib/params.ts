import { loadLandingsConfig, type LoadLandingsConfigOptions } from "./config.js";
import { loadLandings } from "./content.js";

/**
 * `dynamicParams` de las rutas de landing y legales: solo existen los slugs
 * generados por `generateStaticParams`; cualquier otro devuelve 404.
 */
export const dynamicParams = false;

export interface BuildParamsOptions {
  config?: LoadLandingsConfigOptions;
  /** Carpeta de contenido de landings a leer (por defecto, la de la instancia resuelta). */
  landingsDir?: string;
}

/** Parámetros de `app/[slug]/page.tsx`: un slug por landing publicada. */
export function buildLandingParams(options: BuildParamsOptions = {}): Array<{ slug: string }> {
  const { instance, isDraft } = loadLandingsConfig(options.config);
  return loadLandings(instance.id, { dir: options.landingsDir, includeDrafts: isDraft }).map(
    (landing) => ({ slug: landing.slug }),
  );
}

/** Parámetros de `app/legal/[slug]/page.tsx`: un slug por página del pack de mercado. */
export function buildLegalParams(
  options: Pick<BuildParamsOptions, "config"> = {},
): Array<{ slug: string }> {
  const { instance } = loadLandingsConfig(options.config);
  return instance.marketPack.legalTexts.pages.map((page) => ({ slug: page.slug }));
}
