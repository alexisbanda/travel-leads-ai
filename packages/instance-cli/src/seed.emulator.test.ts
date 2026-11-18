import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getMarketPack } from "@tla/markets";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { DEFAULT_INSTANCES_DIR } from "./load.js";
import { runSeed } from "./seed.js";

/**
 * Integración con el emulador de Firestore: `pnpm test:emulator` (lo lanza
 * con `firebase emulators:exec`). Sin `FIRESTORE_EMULATOR_HOST` se salta.
 * Usa una copia de ec-es con un proyecto `demo-*` del emulador: nunca toca
 * proyectos reales ni credenciales.
 */
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const PROJECT_ID = process.env.GCLOUD_PROJECT?.startsWith("demo-")
  ? process.env.GCLOUD_PROJECT
  : "demo-tla-seed";

describe.skipIf(EMULATOR_HOST === "")("instance:seed contra el emulador de Firestore", () => {
  let instancesDir: string;
  let app: App;
  let db: Firestore;

  beforeAll(() => {
    instancesDir = mkdtempSync(join(tmpdir(), "instance-seed-emulator-"));
    const dir = join(instancesDir, "ec-es");
    cpSync(join(DEFAULT_INSTANCES_DIR, "ec-es"), dir, { recursive: true });
    const file = join(dir, "instance.yaml");
    const doc = parseDocument(readFileSync(file, "utf8"));
    doc.setIn(["infra", "firebaseProjects", "dev"], PROJECT_ID);
    writeFileSync(file, doc.toString());
    app = initializeApp({ projectId: PROJECT_ID }, "seed-emulator-test");
    db = getFirestore(app);
  });

  afterAll(async () => {
    await deleteApp(app);
    rmSync(instancesDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const response = await fetch(
      `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
      { method: "DELETE" },
    );
    expect(response.ok).toBe(true);
  });

  async function seed(): Promise<string[]> {
    const stdout: string[] = [];
    const code = await runSeed(["ec-es", "local"], {
      instancesDir,
      stdout: (line) => stdout.push(line),
      stderr: (line) => stdout.push(line),
    });
    expect(code, stdout.join("\n")).toBe(0);
    return stdout;
  }

  async function configDocs() {
    const snapshot = await db.collection("config").get();
    return Object.fromEntries(snapshot.docs.map((doc) => [doc.id, doc.data()]));
  }

  it("crea config/sla, config/agents y config/flags", async () => {
    expect(await seed()).toEqual([
      `ec-es (local, ${PROJECT_ID}): config/sla, config/agents, config/flags: 3 documentos escritos`,
    ]);
    const docs = await configDocs();
    expect(Object.keys(docs).sort()).toEqual(["agents", "flags", "sla"]);
    expect(docs.sla).toEqual({
      warnAfterMinutes: 10,
      breachAfterMinutes: 30,
      businessHours: { start: "09:00", end: "21:00", days: [1, 2, 3, 4, 5, 6] },
      timezone: getMarketPack("ES")?.timezone,
    });
    expect(docs.agents).toEqual({
      qualification: { enabled: true, mode: "assisted" },
      proposal: { enabled: false },
      persona: { name: "" },
    });
    expect(docs.flags).toEqual({ mcpCatalog: false });
  });

  it("es idempotente y conserva los campos añadidos a mano", async () => {
    await seed();
    const first = await configDocs();
    await db.doc("config/sla").set({ note: "ajuste manual" }, { merge: true });
    await seed();
    const second = await configDocs();
    expect(second.sla).toEqual({ ...first.sla, note: "ajuste manual" });
    expect(second.agents).toEqual(first.agents);
    expect(second.flags).toEqual(first.flags);
  });
});
