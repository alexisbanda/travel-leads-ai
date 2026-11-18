import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { RESOLVED_INSTANCE_FILE, type ResolvedInstanceConfig } from "@tla/shared";
import { isEntryPoint, REPO_ROOT, resolveInstanceById, stripDashDash } from "./cli.js";
import { DEFAULT_INSTANCES_DIR, defaultPackRegistry, type PackRegistry } from "./load.js";
import { formatReport } from "./validate.js";

/** Ruta por defecto de la configuración resuelta: `<repo>/generated/instance.json`. */
export const DEFAULT_OUT_FILE = join(REPO_ROOT, RESOLVED_INSTANCE_FILE);

/** Copia de `value` con las claves de los objetos ordenadas recursivamente. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** Serialización determinista: claves ordenadas, 2 espacios, `\n` final y sin marcas de tiempo. */
export function serializeResolved(config: ResolvedInstanceConfig): string {
  return `${JSON.stringify(sortKeys(config), null, 2)}\n`;
}

export interface BuildOptions {
  /** Carpeta de instancias; por defecto, `instances/` del repositorio. */
  instancesDir?: string;
  registry?: PackRegistry;
  /** Base de las rutas relativas de `--out`. */
  cwd?: string;
  /** Archivo de salida si no se pasa `--out`. */
  defaultOut?: string;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

const USAGE = "uso: pnpm instance:build <id> [--out <ruta>]";

type Args = { id: string; out?: string } | { error: string };

function parseArgs(argv: string[]): Args {
  const args = stripDashDash(argv);
  const positional: string[] = [];
  let out: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] as string;
    if (arg === "--out") {
      const value = args[++index];
      if (value === undefined || value === "") return { error: "--out necesita una ruta" };
      if (out !== undefined) return { error: "--out solo se puede indicar una vez" };
      out = value;
    } else if (arg.startsWith("-")) {
      return { error: `opción desconocida: ${arg}` };
    } else {
      positional.push(arg);
    }
  }
  const [id] = positional;
  if (id === undefined) return { error: "indica el id de la instancia" };
  if (positional.length > 1) return { error: "indica un solo id de instancia" };
  return { id, out };
}

/**
 * Ejecuta `instance:build`: resuelve la instancia con sus packs y escribe la
 * configuración resuelta. Si algo falla no escribe nada. Devuelve el código
 * de salida.
 */
export function runBuild(argv: string[], options: BuildOptions = {}): number {
  const stdout = options.stdout ?? ((line: string) => console.log(line));
  const stderr = options.stderr ?? ((line: string) => console.error(line));
  const cwd = options.cwd ?? process.cwd();

  const args = parseArgs(argv);
  if ("error" in args) {
    stderr(`instance:build: ${args.error}`);
    stderr(USAGE);
    return 1;
  }

  const result = resolveInstanceById(
    args.id,
    options.instancesDir ?? DEFAULT_INSTANCES_DIR,
    options.registry ?? defaultPackRegistry,
  );
  if (!result.ok) {
    if ("error" in result) {
      stderr(`instance:build: ${result.error}`);
    } else {
      for (const line of formatReport({
        name: args.id,
        schemaOnly: false,
        issues: result.issues,
      })) {
        stderr(line);
      }
      stderr(`instance:build: no se ha generado la configuración de ${args.id}`);
    }
    return 1;
  }

  const out =
    args.out === undefined ? (options.defaultOut ?? DEFAULT_OUT_FILE) : resolve(cwd, args.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, serializeResolved(result.config));
  stdout(`${args.id}: configuración resuelta en ${relative(cwd, out) || out}`);
  return 0;
}

if (isEntryPoint(import.meta.url)) {
  // pnpm ejecuta el script desde la carpeta del paquete; INIT_CWD es donde se lanzó.
  process.exitCode = runBuild(process.argv.slice(2), { cwd: process.env.INIT_CWD });
}
