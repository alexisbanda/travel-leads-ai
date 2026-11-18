import { applicationDefault, deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { buildConfigDocs, CONFIG_DOC_IDS, type ConfigDocId, type ConfigDocs } from "@tla/shared";
import { isEntryPoint, resolveInstanceById, stripDashDash } from "./cli.js";
import { DEFAULT_INSTANCES_DIR, defaultPackRegistry, type PackRegistry } from "./load.js";
import { formatReport } from "./validate.js";

/** Entornos admitidos. `prod` está prohibido a propósito. */
export const SEED_ENVS = ["local", "dev"] as const;
export type SeedEnv = (typeof SEED_ENVS)[number];

/** Host del emulador de Firestore por defecto (`firebase.json`). */
export const DEFAULT_EMULATOR_HOST = "127.0.0.1:8080";

/** Destino de los documentos `config/*`. */
export interface ConfigWriter {
  /** Escribe `config/<id>` fusionando con lo que ya haya (`set(data, { merge: true })`). */
  write(id: ConfigDocId, data: ConfigDocs[ConfigDocId]): Promise<void>;
  close(): Promise<void>;
}

export interface WriterTarget {
  env: SeedEnv;
  projectId: string;
}

export type ConfigWriterFactory = (target: WriterTarget) => ConfigWriter;

/**
 * Escritor con `firebase-admin` en una app con nombre propio. En `local`
 * habla con el emulador (`FIRESTORE_EMULATOR_HOST`); en `dev`, con
 * credenciales por defecto de la aplicación (ADC).
 */
export const firestoreWriterFactory: ConfigWriterFactory = ({ env, projectId }) => {
  const app = initializeApp(
    env === "dev" ? { projectId, credential: applicationDefault() } : { projectId },
    `instance-seed-${process.pid}-${Date.now()}`,
  );
  const db = getFirestore(app);
  return {
    async write(id, data) {
      await db.collection("config").doc(id).set(data, { merge: true });
    },
    close: () => deleteApp(app),
  };
};

export interface SeedOptions {
  instancesDir?: string;
  registry?: PackRegistry;
  /** Variables de entorno; por defecto, `process.env` (`local` fija ahí el host del emulador). */
  env?: NodeJS.ProcessEnv;
  writerFactory?: ConfigWriterFactory;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

const USAGE = "uso: pnpm instance:seed <id> local|dev";

function isSeedEnv(value: string): value is SeedEnv {
  return (SEED_ENVS as readonly string[]).includes(value);
}

/**
 * Ejecuta `instance:seed`: resuelve la instancia en memoria y escribe
 * `config/sla`, `config/agents` y `config/flags`. Idempotente y conserva los
 * campos que no gestiona. Devuelve el código de salida.
 */
export async function runSeed(argv: string[], options: SeedOptions = {}): Promise<number> {
  const stdout = options.stdout ?? ((line: string) => console.log(line));
  const stderr = options.stderr ?? ((line: string) => console.error(line));
  const env = options.env ?? process.env;

  const args = stripDashDash(argv);
  const usage = (message: string): number => {
    stderr(`instance:seed: ${message}`);
    stderr(USAGE);
    return 1;
  };
  if (args.some((arg) => arg.startsWith("-"))) {
    return usage(`opción desconocida: ${args.find((arg) => arg.startsWith("-"))}`);
  }
  const [id, target] = args;
  if (target === "prod") {
    stderr("instance:seed: seed contra prod no permitido; usa local o dev");
    return 1;
  }
  if (id === undefined || target === undefined || args.length > 2) {
    return usage("indica el id de la instancia y el entorno");
  }
  if (!isSeedEnv(target)) return usage(`entorno desconocido: ${target}`);

  const result = resolveInstanceById(
    id,
    options.instancesDir ?? DEFAULT_INSTANCES_DIR,
    options.registry ?? defaultPackRegistry,
  );
  if (!result.ok) {
    if ("error" in result) {
      stderr(`instance:seed: ${result.error}`);
    } else {
      for (const line of formatReport({ name: id, schemaOnly: false, issues: result.issues })) {
        stderr(line);
      }
      stderr(`instance:seed: no se ha sembrado ${id}`);
    }
    return 1;
  }

  const { firebaseProjects } = result.config.infra;
  const emulatorHost = env.FIRESTORE_EMULATOR_HOST ?? "";
  if (target === "local" && emulatorHost === "") {
    env.FIRESTORE_EMULATOR_HOST = DEFAULT_EMULATOR_HOST;
  }
  if (target === "dev" && emulatorHost !== "") {
    stderr(
      `instance:seed: FIRESTORE_EMULATOR_HOST=${emulatorHost} apuntaría al emulador; quítala para sembrar dev o usa local`,
    );
    return 1;
  }
  const projectId = firebaseProjects.dev;
  if (projectId === firebaseProjects.prod) {
    stderr(`instance:seed: seed contra prod no permitido (${projectId} es el proyecto de prod)`);
    return 1;
  }

  const docs = buildConfigDocs(result.config);
  const writer = (options.writerFactory ?? firestoreWriterFactory)({ env: target, projectId });
  try {
    for (const docId of CONFIG_DOC_IDS) await writer.write(docId, docs[docId]);
  } catch (error) {
    stderr(
      `instance:seed: no se pudo escribir en ${projectId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  } finally {
    await writer.close();
  }
  const paths = CONFIG_DOC_IDS.map((docId) => `config/${docId}`).join(", ");
  stdout(`${id} (${target}, ${projectId}): ${paths}: ${CONFIG_DOC_IDS.length} documentos escritos`);
  return 0;
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = await runSeed(process.argv.slice(2));
}
