import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { LandingSlug, type LandingContent, type ResolvedInstanceConfig } from "@tla/shared";
import { isEntryPoint, resolveInstanceById, stripDashDash } from "./cli.js";
import { LANDINGS_DIR, validateLandingFiles } from "./landing-content.js";
import { parseBrief, type LandingBrief } from "./landing-generate/brief.js";
import {
  estimateCostUsd,
  resolveLandingModel,
  type TokenUsage,
} from "./landing-generate/config.js";
import { assembleLanding, landingDraftJsonSchema, parseDraft } from "./landing-generate/draft.js";
import { checkGuardrails, type GuardrailContext } from "./landing-generate/guardrails.js";
import {
  AnthropicLandingModel,
  type ConversationTurn,
  type LandingModel,
} from "./landing-generate/model.js";
import {
  buildRetryMessage,
  buildSystemPrompt,
  buildUserMessage,
  styleExample,
} from "./landing-generate/prompt.js";
import { DEFAULT_INSTANCES_DIR, defaultPackRegistry, type PackRegistry } from "./load.js";
import { formatReport } from "./validate.js";

const COMMAND = "instance:landing:generate";
const USAGE = `uso: pnpm ${COMMAND} <id> <slug> --brief <ruta> [--from <slugBase>] [--model <id>] [--force]`;

/** Intentos máximos: el primero y un único reintento con los errores de validación. */
export const MAX_ATTEMPTS = 2;

export interface LandingGenerateOptions {
  argv: string[];
  /** Carpeta de instancias; por defecto, `instances/` del repositorio. */
  instancesDir?: string;
  registry?: PackRegistry;
  /** Base de la ruta relativa de `--brief`. */
  cwd?: string;
  /** Entorno (para `TLA_LANDING_MODEL`). */
  env?: Readonly<Record<string, string | undefined>>;
  /**
   * Carpeta donde se escribe la landing; por defecto,
   * `instances/<id>/content/landings`. Las evals la apuntan a un temporal.
   */
  landingsDir?: string;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

export interface LandingGenerateDeps {
  /** Cliente del modelo; los tests inyectan uno simulado. */
  model: LandingModel;
}

interface Args {
  id: string;
  slug: string;
  brief: string;
  from?: string;
  model?: string;
  force: boolean;
}

function parseArgs(argv: string[]): Args | { error: string } {
  const args = stripDashDash(argv);
  const positional: string[] = [];
  const values: Partial<Record<"brief" | "from" | "model", string>> = {};
  let force = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] as string;
    if (arg === "--force") {
      force = true;
    } else if (arg === "--brief" || arg === "--from" || arg === "--model") {
      const key = arg.slice(2) as "brief" | "from" | "model";
      const value = args[++index];
      if (value === undefined || value === "" || value.startsWith("--")) {
        return { error: `${arg} necesita un valor` };
      }
      if (values[key] !== undefined) return { error: `${arg} solo se puede indicar una vez` };
      values[key] = value;
    } else if (arg.startsWith("-")) {
      return { error: `opción desconocida: ${arg}` };
    } else {
      positional.push(arg);
    }
  }
  const [id, slug] = positional;
  if (id === undefined || slug === undefined)
    return { error: "indica el id de la instancia y el slug" };
  if (positional.length > 2) return { error: "sobran argumentos: indica solo <id> y <slug>" };
  if (values.brief === undefined) return { error: "falta --brief <ruta>" };
  return { id, slug, brief: values.brief, from: values.from, model: values.model, force };
}

function displayPath(cwd: string, path: string): string {
  const shown = relative(cwd, path);
  return shown === "" || shown.startsWith("..") || isAbsolute(shown) ? path : shown;
}

/** Todo lo que se comprueba antes de llamar al modelo. */
interface Prepared {
  config: ResolvedInstanceConfig;
  instanceDir: string;
  brief: LandingBrief;
  legalSlugs: string[];
  guardrails: GuardrailContext;
  example?: unknown;
  outFile: string;
}

function prepare(args: Args, options: LandingGenerateOptions): Prepared | { errors: string[] } {
  const instancesDir = options.instancesDir ?? DEFAULT_INSTANCES_DIR;
  const resolved = resolveInstanceById(
    args.id,
    instancesDir,
    options.registry ?? defaultPackRegistry,
  );
  if (!resolved.ok) {
    if ("error" in resolved) return { errors: [resolved.error] };
    return {
      errors: formatReport({ name: args.id, schemaOnly: false, issues: resolved.issues }),
    };
  }
  const config = resolved.config;
  const instanceDir = join(instancesDir, args.id);
  const legalSlugs = config.marketPack.legalTexts.pages.map((page) => page.slug);

  if (!LandingSlug.safeParse(args.slug).success) {
    return { errors: [`slug inválido «${args.slug}»: usa kebab-case (minúsculas, dígitos y -)`] };
  }
  if (legalSlugs.includes(args.slug)) {
    return { errors: [`el slug «${args.slug}» colisiona con el slug de una página legal`] };
  }

  let example: unknown;
  if (args.from !== undefined) {
    const fromFile = join(instanceDir, LANDINGS_DIR, `${args.from}.json`);
    if (!LandingSlug.safeParse(args.from).success || !existsSync(fromFile)) {
      return {
        errors: [`--from: no existe la landing «${args.from}» (${LANDINGS_DIR}/${args.from}.json)`],
      };
    }
    try {
      example = styleExample(JSON.parse(readFileSync(fromFile, "utf8")));
    } catch (error) {
      return {
        errors: [
          `--from: no se pudo leer ${LANDINGS_DIR}/${args.from}.json: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }
  }

  const cwd = options.cwd ?? process.cwd();
  const briefPath = resolve(cwd, args.brief);
  let source: string;
  try {
    source = readFileSync(briefPath, "utf8");
  } catch {
    return { errors: [`no se puede leer el brief: ${args.brief}`] };
  }
  const parsed = parseBrief(source);
  if (!parsed.ok) return { errors: parsed.errors.map((error) => `brief: ${error}`) };
  const brief = parsed.brief;
  const segments = config.segments.map((segment) => segment.id);
  if (!segments.includes(brief.segment)) {
    return {
      errors: [
        `brief: segment «${brief.segment}» no está en segments de la instancia (${segments.join(", ")})`,
      ],
    };
  }

  const forbiddenClaims = config.marketPack.contentGuardrails?.forbiddenClaims;
  if (forbiddenClaims === undefined) {
    return {
      errors: [
        `el pack de mercado ${config.marketPack.country} no define contentGuardrails.forbiddenClaims: no se puede generar contenido sin salvaguardas`,
      ],
    };
  }

  const outFile = join(options.landingsDir ?? join(instanceDir, LANDINGS_DIR), `${args.slug}.json`);
  if (existsSync(outFile) && !args.force) {
    return { errors: [`ya existe ${displayPath(cwd, outFile)}: usa --force para sobrescribirlo`] };
  }

  return {
    config,
    instanceDir,
    brief,
    legalSlugs,
    guardrails: {
      locale: config.market.locale,
      currency: config.market.currency,
      forbiddenClaims,
    },
    example,
    outFile,
  };
}

type Checked = { ok: true; landing: LandingContent } | { ok: false; errors: string[] };

/** Compone la landing y aplica todas las validaciones: borrador, salvaguardas y esquema. */
function check(draft: unknown, slug: string, prepared: Prepared): Checked {
  const parsed = parseDraft(draft, prepared.brief);
  if (!parsed.ok) return parsed;
  const landing = assembleLanding(parsed.draft, prepared.brief, slug);
  const errors = [
    ...checkGuardrails(landing, prepared.guardrails),
    ...validateLandingFiles(
      [{ file: `${LANDINGS_DIR}/${slug}.json`, json: landing }],
      prepared.legalSlugs,
    ).map((issue) => `${issue.path}: ${issue.message}`),
  ];
  return errors.length === 0 ? { ok: true, landing } : { ok: false, errors };
}

function usageLines(model: string, usage: TokenUsage, calls: number): string[] {
  const cost = estimateCostUsd(model, usage);
  return [
    `Tokens: ${usage.inputTokens} de entrada y ${usage.outputTokens} de salida (${calls} ${calls === 1 ? "llamada" : "llamadas"} a ${model})`,
    cost === undefined
      ? `Coste estimado: coste no disponible para el modelo ${model}`
      : `Coste estimado: ${cost.toFixed(4)} USD`,
  ];
}

/**
 * Ejecuta `instance:landing:generate`: valida instancia, slug, `--from`,
 * brief y destino ANTES de llamar al modelo; compone y valida la landing
 * (con un único reintento que envía los errores al modelo) y, si es válida,
 * la escribe con `draft: true`. Si falla, no escribe nada. Devuelve el código
 * de salida.
 */
export async function runLandingGenerate(
  options: LandingGenerateOptions,
  deps: LandingGenerateDeps,
): Promise<number> {
  const stdout = options.stdout ?? ((line: string) => console.log(line));
  const stderr = options.stderr ?? ((line: string) => console.error(line));
  const cwd = options.cwd ?? process.cwd();
  const fail = (errors: readonly string[]): number => {
    for (const error of errors) stderr(`${COMMAND}: ${error}`);
    return 1;
  };

  const args = parseArgs(options.argv);
  if ("error" in args) return fail([args.error, USAGE]);
  const prepared = prepare(args, options);
  if ("errors" in prepared) return fail(prepared.errors);

  const model = resolveLandingModel(args.model, options.env ?? process.env);
  const system = buildSystemPrompt(prepared.brief, {
    locale: prepared.config.market.locale,
    agentTone: prepared.config.marketPack.agentTone,
    example: prepared.example,
  });
  const schema = landingDraftJsonSchema(prepared.brief.ctaType);
  const messages: ConversationTurn[] = [
    { role: "user", content: buildUserMessage(prepared.brief) },
  ];
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  let calls = 0;
  let pricedModel = model;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let output;
    try {
      output = await deps.model.generate({ model, system, messages: [...messages], schema });
    } catch (error) {
      if (calls > 0) for (const line of usageLines(pricedModel, usage, calls)) stderr(line);
      return fail([error instanceof Error ? error.message : String(error)]);
    }
    calls++;
    usage.inputTokens += output.usage.inputTokens;
    usage.outputTokens += output.usage.outputTokens;
    if (estimateCostUsd(output.model, usage) !== undefined) pricedModel = output.model;

    const result = check(output.draft, args.slug, prepared);
    if (result.ok) {
      mkdirSync(dirname(prepared.outFile), { recursive: true });
      writeFileSync(prepared.outFile, `${JSON.stringify(result.landing, null, 2)}\n`);
      const mediaDir = join(prepared.instanceDir, "content/media");
      stdout(`Escrito: ${displayPath(cwd, prepared.outFile)}`);
      stdout(
        "Queda en draft: true para revisión humana: revisa los textos y los hechos antes de publicar (draft: false lo pone una persona).",
      );
      stdout(
        `Medios que faltan para publicar (en ${displayPath(cwd, mediaDir)}, referenciados como /media/<ruta>):`,
      );
      stdout("  - hero.media: vídeo o imagen del hero, con su texto alternativo (alt)");
      stdout('  - gallery: de 3 a 12 imágenes (kind: "image"), y añade "gallery" a sections');
      for (const line of usageLines(pricedModel, usage, calls)) stdout(line);
      return 0;
    }

    if (attempt < MAX_ATTEMPTS) {
      stderr(
        `${COMMAND}: la respuesta no pasa la validación (${result.errors.length} errores); reintentando una vez con los errores`,
      );
      messages.push(
        { role: "assistant", content: JSON.stringify(output.draft) },
        { role: "user", content: buildRetryMessage(result.errors) },
      );
      continue;
    }
    stderr(
      `${COMMAND}: la respuesta no pasa la validación tras ${MAX_ATTEMPTS} intentos; no se ha escrito nada:`,
    );
    for (const error of result.errors) stderr(`  ${error}`);
    for (const line of usageLines(pricedModel, usage, calls)) stderr(line);
    return 1;
  }
  return 1;
}

if (isEntryPoint(import.meta.url)) {
  // pnpm ejecuta el script desde la carpeta del paquete; INIT_CWD es donde se lanzó.
  runLandingGenerate(
    { argv: process.argv.slice(2), cwd: process.env.INIT_CWD },
    { model: new AnthropicLandingModel() },
  ).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(`${COMMAND}: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    },
  );
}
