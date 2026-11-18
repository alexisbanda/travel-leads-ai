import { mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConfigDocId } from "@tla/shared";
import { afterAll, describe, expect, it, vi } from "vitest";
import { parseDocument } from "yaml";
import { DEFAULT_INSTANCES_DIR, loadInstance } from "./load.js";
import {
  DEFAULT_EMULATOR_HOST,
  runSeed,
  type ConfigWriterFactory,
  type WriterTarget,
} from "./seed.js";

const SOURCE = join(DEFAULT_INSTANCES_DIR, "ec-es");
const loaded = loadInstance(SOURCE);
if (!loaded.ok) throw new Error("ec-es no carga");
const projects = loaded.config.infra.firebaseProjects;
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function instancesWith(changes: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "instance-seed-"));
  tempDirs.push(root);
  const dir = join(root, "ec-es");
  cpSync(SOURCE, dir, { recursive: true });
  const file = join(dir, "instance.yaml");
  const doc = parseDocument(readFileSync(file, "utf8"));
  for (const [path, value] of Object.entries(changes)) doc.setIn(path.split("."), value);
  writeFileSync(file, doc.toString());
  return root;
}

function fakeWriter() {
  const targets: WriterTarget[] = [];
  const written: Array<[ConfigDocId, unknown]> = [];
  let closed = 0;
  const factory = vi.fn<ConfigWriterFactory>((target) => {
    targets.push(target);
    return {
      write: async (id, data) => {
        written.push([id, data]);
      },
      close: async () => {
        closed++;
      },
    };
  });
  return { factory, targets, written, closed: () => closed };
}

async function run(argv: string[], env: NodeJS.ProcessEnv = {}, instancesDir?: string) {
  const writer = fakeWriter();
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runSeed(argv, {
    env,
    instancesDir,
    writerFactory: writer.factory,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  return { code, stdout, stderr, writer };
}

describe("instance:seed", () => {
  it("rechaza prod sin crear ningún escritor", async () => {
    const { code, stderr, writer } = await run(["ec-es", "prod"]);
    expect(code).toBe(1);
    expect(stderr[0]).toMatch(/seed contra prod no permitido/);
    expect(writer.factory).not.toHaveBeenCalled();
  });

  it("rechaza entornos desconocidos y argumentos inválidos", async () => {
    for (const argv of [
      ["ec-es", "staging"],
      ["ec-es"],
      [],
      ["ec-es", "dev", "extra"],
      ["ec-es", "local", "--force"],
    ]) {
      const { code, stderr, writer } = await run(argv);
      expect(code).toBe(1);
      expect(stderr.at(-1)).toMatch(/^uso: pnpm instance:seed/);
      expect(writer.factory).not.toHaveBeenCalled();
    }
  });

  it("rechaza plantillas e instancias inexistentes", async () => {
    expect((await run(["_template", "local"])).code).toBe(1);
    const missing = await run(["zz-yy", "local"]);
    expect(missing.code).toBe(1);
    expect(missing.writer.factory).not.toHaveBeenCalled();
  });

  it("local fija el emulador por defecto y escribe los tres documentos en el proyecto dev", async () => {
    const env: NodeJS.ProcessEnv = {};
    const { code, stdout, writer } = await run(["ec-es", "local"], env);
    expect(code).toBe(0);
    expect(env.FIRESTORE_EMULATOR_HOST).toBe(DEFAULT_EMULATOR_HOST);
    expect(writer.targets).toEqual([{ env: "local", projectId: projects.dev }]);
    expect(writer.written.map(([id]) => id)).toEqual(["sla", "agents", "flags"]);
    expect(writer.written[0]?.[1]).toMatchObject({ warnAfterMinutes: 10, breachAfterMinutes: 30 });
    expect(writer.closed()).toBe(1);
    expect(stdout).toEqual([
      `ec-es (local, ${projects.dev}): config/sla, config/agents, config/flags: 3 documentos escritos`,
    ]);
  });

  it("local respeta un FIRESTORE_EMULATOR_HOST ya definido", async () => {
    const env: NodeJS.ProcessEnv = { FIRESTORE_EMULATOR_HOST: "127.0.0.1:9999" };
    expect((await run(["ec-es", "local"], env)).code).toBe(0);
    expect(env.FIRESTORE_EMULATOR_HOST).toBe("127.0.0.1:9999");
  });

  it("dev se niega si FIRESTORE_EMULATOR_HOST está definido", async () => {
    const { code, stderr, writer } = await run(["ec-es", "dev"], {
      FIRESTORE_EMULATOR_HOST: DEFAULT_EMULATOR_HOST,
    });
    expect(code).toBe(1);
    expect(stderr[0]).toMatch(/apuntaría al emulador/);
    expect(writer.factory).not.toHaveBeenCalled();
  });

  it("dev usa el proyecto dev de la instancia", async () => {
    const { code, writer } = await run(["ec-es", "dev"]);
    expect(code).toBe(0);
    expect(writer.targets).toEqual([{ env: "dev", projectId: projects.dev }]);
  });

  it("se niega si el proyecto dev coincide con el de prod", async () => {
    const instancesDir = instancesWith({ "infra.firebaseProjects.dev": projects.prod });
    const { code, stderr, writer } = await run(["ec-es", "dev"], {}, instancesDir);
    expect(code).toBe(1);
    expect(stderr[0]).toMatch(/seed contra prod no permitido/);
    expect(writer.factory).not.toHaveBeenCalled();
  });

  it("no siembra una instancia que no se puede resolver", async () => {
    const instancesDir = instancesWith({ "infra.bigqueryLocation": "US" });
    const { code, stderr, writer } = await run(["ec-es", "local"], {}, instancesDir);
    expect(code).toBe(1);
    expect(stderr[1]).toMatch(/\[data-region\] infra\.bigqueryLocation/);
    expect(writer.factory).not.toHaveBeenCalled();
  });

  it("informa del error de escritura y cierra el escritor", async () => {
    let closed = false;
    const stderr: string[] = [];
    const code = await runSeed(["ec-es", "local"], {
      env: {},
      writerFactory: () => ({
        write: async () => {
          throw new Error("sin conexión");
        },
        close: async () => {
          closed = true;
        },
      }),
      stdout: () => undefined,
      stderr: (line) => stderr.push(line),
    });
    expect(code).toBe(1);
    expect(stderr[0]).toMatch(/sin conexión/);
    expect(closed).toBe(true);
  });
});
