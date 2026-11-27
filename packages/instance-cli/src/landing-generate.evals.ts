import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@anthropic-ai/sdk/core/credentials";
import type { ResolvedInstanceConfig } from "@tla/shared";
import { isEntryPoint, resolveInstanceById } from "./cli.js";
import { validateLandingFiles, LANDINGS_DIR } from "./landing-content.js";
import { runLandingGenerate } from "./landing-generate.js";
import { parseBrief, type LandingBrief } from "./landing-generate/brief.js";
import { checkGuardrails, collectTexts, normalizeText } from "./landing-generate/guardrails.js";
import { AnthropicLandingModel } from "./landing-generate/model.js";
import { DEFAULT_INSTANCES_DIR, defaultPackRegistry, listInstanceDirs } from "./load.js";

/**
 * Evals del generador de landings (`pnpm evals`). Corre el pipeline REAL
 * contra la API de Claude con los briefs ficticios de
 * `evals/landing-generate/`, escribiendo en un directorio temporal (nunca en
 * `instances/`). Sin credenciales, se salta y sale con 0.
 *
 * Instancia: `INSTANCE` o, si no se indica, la primera de `instances/`. Los
 * `segment` de los briefs deben existir en ella.
 */

export const BRIEFS_DIR = fileURLToPath(new URL("../evals/landing-generate", import.meta.url));

export const SKIPPED_MESSAGE =
  "skipped: sin credenciales de Claude (ANTHROPIC_API_KEY o ant auth login)";

/**
 * Palabras vacías por IDIOMA (subetiqueta de idioma del locale, no país),
 * normalizadas sin tildes. Heurística: el idioma del locale del mercado debe
 * ser el que más palabras vacías aporta y cubrir al menos
 * `MIN_STOPWORD_RATIO` de las palabras. Para un idioma nuevo, añade su lista.
 */
export const STOPWORDS: Readonly<Record<string, readonly string[]>> = {
  es: "de la que el en y a los se del las un por con no una su para es al lo como mas o pero sus le ha me si sin sobre este ya entre cuando todo esta ser son dos tambien muy hasta desde nos durante uno ni ese eso te tu tus".split(
    " ",
  ),
  en: "the of and to in is you that it for on with as are this be at by from or your an we our can will all".split(
    " ",
  ),
  pt: "de a o que e do da em um para com nao uma os no se na por mais as dos como mas ao das seu sua ou quando muito nos ja tambem pelo pela ate isso voce".split(
    " ",
  ),
  fr: "de la le et les des en un du une que est pour qui dans par sur pas au plus ne se ce avec il sont vous nous mais ou aux".split(
    " ",
  ),
  de: "der die und in den von zu das mit sich des auf fur ist im dem nicht ein eine als auch es an werden aus er hat dass sie nach wird bei".split(
    " ",
  ),
  it: "di e il la che in a per un del non sono una le con si da i al gli della nel come anche piu ma ha questo".split(
    " ",
  ),
};
export const MIN_STOPWORD_RATIO = 0.15;

/** Comprueba que los textos estén en el idioma del locale (heurística de palabras vacías). */
export function checkLanguage(landing: unknown, locale: string): string[] {
  const language = locale.split("-")[0]?.toLowerCase() ?? "";
  const target = STOPWORDS[language];
  if (target === undefined)
    return [`idioma: no hay palabras vacías para «${language}» (añádelas en STOPWORDS)`];
  const words = collectTexts(landing)
    .flatMap(({ text }) => normalizeText(text).split(/[^\p{L}]+/u))
    .filter((word) => word !== "");
  if (words.length === 0) return ["idioma: la landing no tiene textos"];
  const counts = Object.fromEntries(
    Object.entries(STOPWORDS).map(([lang, list]) => {
      const set = new Set(list);
      return [lang, words.filter((word) => set.has(word)).length];
    }),
  );
  const own = counts[language] ?? 0;
  const ratio = own / words.length;
  const rival = Object.entries(counts).find(([lang, count]) => lang !== language && count > own);
  const errors: string[] = [];
  if (ratio < MIN_STOPWORD_RATIO) {
    errors.push(
      `idioma: solo ${(ratio * 100).toFixed(1)} % de palabras vacías de «${language}» (mínimo ${MIN_STOPWORD_RATIO * 100} %)`,
    );
  }
  if (rival !== undefined) errors.push(`idioma: el texto parece «${rival[0]}», no «${language}»`);
  return errors;
}

/** Comprobaciones de una landing generada para un brief. Devuelve los fallos. */
export function evaluateLanding(
  landing: unknown,
  slug: string,
  brief: LandingBrief,
  config: ResolvedInstanceConfig,
): string[] {
  const legalSlugs = config.marketPack.legalTexts.pages.map((page) => page.slug);
  const failures = validateLandingFiles(
    [{ file: `${LANDINGS_DIR}/${slug}.json`, json: landing }],
    legalSlugs,
  ).map((issue) => `esquema: ${issue.path}: ${issue.message}`);
  const record = (typeof landing === "object" && landing !== null ? landing : {}) as Record<
    string,
    unknown
  >;
  const price = record.priceGuidance as { from?: unknown } | undefined;
  if (brief.priceFrom === undefined && price !== undefined)
    failures.push("precio: hay priceGuidance sin priceFrom en el brief");
  if (brief.priceFrom !== undefined && price?.from !== brief.priceFrom) {
    failures.push(`precio: priceGuidance.from debe ser ${brief.priceFrom}`);
  }
  if (record.draft !== true) failures.push("draft: debe ser true");
  failures.push(
    ...checkGuardrails(landing, {
      locale: config.market.locale,
      currency: config.market.currency,
      forbiddenClaims: config.marketPack.contentGuardrails?.forbiddenClaims ?? [],
    }).map((error) => `salvaguardas: ${error}`),
  );
  failures.push(...checkLanguage(landing, config.market.locale));
  return failures;
}

/** `true` si hay credenciales de Claude en el entorno o en un perfil de `ant auth login`. No imprime secretos. */
export async function hasClaudeCredentials(
  env: Readonly<Record<string, string | undefined>> = process.env,
  load: () => Promise<unknown> = () => loadConfig(),
): Promise<boolean> {
  if ((env.ANTHROPIC_API_KEY ?? "").trim() !== "" || (env.ANTHROPIC_AUTH_TOKEN ?? "").trim() !== "")
    return true;
  try {
    return (await load()) !== null;
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  if (!(await hasClaudeCredentials())) {
    console.log(SKIPPED_MESSAGE);
    return 0;
  }
  const instance =
    process.env.INSTANCE ?? basename(listInstanceDirs(DEFAULT_INSTANCES_DIR)[0] ?? "");
  const resolved = resolveInstanceById(instance, DEFAULT_INSTANCES_DIR, defaultPackRegistry);
  if (!resolved.ok) {
    console.error(`evals: la instancia «${instance}» no se resuelve`);
    return 1;
  }
  const model = new AnthropicLandingModel();
  const briefs = readdirSync(BRIEFS_DIR)
    .filter((file) => file.endsWith(".md"))
    .sort();
  let failed = 0;
  for (const file of briefs) {
    const path = join(BRIEFS_DIR, file);
    const parsed = parseBrief(readFileSync(path, "utf8"));
    const slug = `eval-${basename(file, ".md")}`;
    const out = mkdtempSync(join(tmpdir(), "tla-landing-evals-"));
    const log: string[] = [];
    try {
      if (!parsed.ok) throw new Error(`brief inválido: ${parsed.errors.join("; ")}`);
      const code = await runLandingGenerate(
        {
          argv: [instance, slug, "--brief", path],
          landingsDir: out,
          stdout: (l) => log.push(l),
          stderr: (l) => log.push(l),
        },
        { model },
      );
      const failures =
        code === 0
          ? evaluateLanding(
              JSON.parse(readFileSync(join(out, `${slug}.json`), "utf8")),
              slug,
              parsed.brief,
              resolved.config,
            )
          : [`el generador salió con ${code}`, ...log];
      if (failures.length > 0) failed++;
      console.log(`${failures.length === 0 ? "ok  " : "FAIL"} ${file}`);
      for (const line of failures.length === 0
        ? log.filter((l) => l.startsWith("Tokens") || l.startsWith("Coste"))
        : failures) {
        console.log(`     ${line}`);
      }
    } catch (error) {
      failed++;
      console.log(`FAIL ${file}\n     ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }
  console.log(`${briefs.length - failed}/${briefs.length} briefs superan las evals`);
  return failed === 0 && briefs.length > 0 ? 0 : 1;
}

if (isEntryPoint(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(`evals: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    },
  );
}
