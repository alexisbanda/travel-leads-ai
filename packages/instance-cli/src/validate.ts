import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateInstanceRules } from "@tla/shared";
import {
  DEFAULT_INSTANCES_DIR,
  defaultPackRegistry,
  hasInstanceFile,
  INSTANCE_FILE,
  isTemplateName,
  listInstanceDirs,
  loadInstance,
  resolvePacks,
  type PackRegistry,
} from "./load.js";

/**
 * Incumplimiento encontrado al validar una instancia. `rule` es un `RuleId`
 * de `@tla/shared` o uno de los chequeos del comando: `read`, `yaml`,
 * `schema` o `instance-id`.
 */
export interface ValidationIssue {
  rule: string;
  path: string;
  message: string;
}

export interface InstanceReport {
  name: string;
  /** Plantilla (`_*`): solo se valida contra `InstanceConfig`. */
  schemaOnly: boolean;
  issues: ValidationIssue[];
}

/**
 * Valida la instancia de `dir`: esquema, `id` igual al nombre de la carpeta
 * y reglas cruzadas con sus packs. Las plantillas (`_*`) solo se validan
 * contra el esquema.
 */
export function validateInstanceDir(
  dir: string,
  registry: PackRegistry = defaultPackRegistry,
): InstanceReport {
  const loaded = loadInstance(dir);
  const schemaOnly = isTemplateName(loaded.name);
  if (!loaded.ok) {
    const issues = loaded.problems.map(({ kind, path, message }) => ({
      rule: kind,
      path,
      message,
    }));
    return { name: loaded.name, schemaOnly, issues };
  }
  if (schemaOnly) return { name: loaded.name, schemaOnly, issues: [] };

  const issues: ValidationIssue[] = [];
  if (loaded.config.id !== loaded.name) {
    issues.push({
      rule: "instance-id",
      path: "id",
      message: `el id «${loaded.config.id}» no coincide con el nombre de la carpeta «${loaded.name}»`,
    });
  }
  issues.push(...validateInstanceRules(loaded.config, resolvePacks(loaded.config, registry)));
  return { name: loaded.name, schemaOnly, issues };
}

/** Líneas de salida de un informe. */
export function formatReport(report: InstanceReport): string[] {
  const count = report.issues.length;
  if (count === 0) return [`${report.name}: OK${report.schemaOnly ? " (solo esquema)" : ""}`];
  return [
    `${report.name}: ${count} ${count === 1 ? "error" : "errores"}`,
    ...report.issues.map((issue) => `  [${issue.rule}] ${issue.path}: ${issue.message}`),
  ];
}

export interface RunOptions {
  /** Carpeta de instancias; por defecto, `instances/` del repositorio. */
  instancesDir?: string;
  registry?: PackRegistry;
  /** Base de las rutas relativas de `--dir`. */
  cwd?: string;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

const USAGE = "uso: pnpm instance:validate [<id>] | pnpm instance:validate --dir <carpeta>";

/** Ids de carpeta admitidos (evita rutas como `../`). */
const FOLDER_NAME = /^[A-Za-z0-9_-]+$/;

type Args = { id?: string; dir?: string } | { error: string };

function parseArgs(argv: string[]): Args {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const positional: string[] = [];
  let dir: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] as string;
    if (arg === "--dir") {
      const value = args[++index];
      if (value === undefined || value === "") return { error: "--dir necesita una carpeta" };
      if (dir !== undefined) return { error: "--dir solo se puede indicar una vez" };
      dir = value;
    } else if (arg.startsWith("-")) {
      return { error: `opción desconocida: ${arg}` };
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 1) return { error: "indica como mucho un id de instancia" };
  const [id] = positional;
  if (id !== undefined && dir !== undefined) return { error: "usa un id o --dir, no ambos" };
  return { id, dir };
}

/** Ejecuta `instance:validate` y devuelve el código de salida (0 si todo es válido). */
export function runValidate(argv: string[], options: RunOptions = {}): number {
  const stdout = options.stdout ?? ((line: string) => console.log(line));
  const stderr = options.stderr ?? ((line: string) => console.error(line));
  const instancesDir = options.instancesDir ?? DEFAULT_INSTANCES_DIR;
  const registry = options.registry ?? defaultPackRegistry;

  const args = parseArgs(argv);
  if ("error" in args) {
    stderr(`instance:validate: ${args.error}`);
    stderr(USAGE);
    return 1;
  }

  let dirs: string[];
  if (args.dir !== undefined) {
    const dir = resolve(options.cwd ?? process.cwd(), args.dir);
    if (!hasInstanceFile(dir)) {
      stderr(`instance:validate: no hay ${INSTANCE_FILE} en ${dir}`);
      return 1;
    }
    dirs = [dir];
  } else if (args.id !== undefined) {
    const dir = join(instancesDir, args.id);
    if (!FOLDER_NAME.test(args.id) || !hasInstanceFile(dir)) {
      stderr(
        `instance:validate: no existe la instancia «${args.id}» (instances/${args.id}/${INSTANCE_FILE})`,
      );
      return 1;
    }
    dirs = [dir];
  } else {
    dirs = listInstanceDirs(instancesDir);
    if (dirs.length === 0) {
      stderr(`instance:validate: no hay instancias en ${instancesDir}`);
      return 1;
    }
  }

  let failed = false;
  for (const dir of dirs) {
    const report = validateInstanceDir(dir, registry);
    if (report.issues.length > 0) failed = true;
    for (const line of formatReport(report)) stdout(line);
  }
  return failed ? 1 : 0;
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  // pnpm ejecuta el script desde la carpeta del paquete; INIT_CWD es donde se lanzó.
  process.exitCode = runValidate(process.argv.slice(2), { cwd: process.env.INIT_CWD });
}
