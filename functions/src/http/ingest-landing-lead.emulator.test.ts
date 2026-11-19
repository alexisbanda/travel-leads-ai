import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ulid } from "../domain/ulid.js";
import {
  CONSENTS_COLLECTION,
  DEDUPE_COLLECTION,
  LEAD_EVENTS_SUBCOLLECTION,
  LEADS_COLLECTION,
  runIngestTransaction,
} from "../integrations/landing-lead-store.js";
import {
  APP_CHECK_HEADER,
  createIngestLandingLeadHandler,
  type IngestRequest,
  type IngestResponse,
} from "./ingest-landing-lead.js";

/**
 * Integración con el emulador de Firestore: `pnpm --filter functions test:emulator`
 * (lo lanza con `firebase emulators:exec`). Sin `FIRESTORE_EMULATOR_HOST` se salta.
 * Usa un proyecto `demo-*`: nunca toca proyectos reales ni credenciales.
 */
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const PROJECT_ID = process.env.GCLOUD_PROJECT?.startsWith("demo-")
  ? process.env.GCLOUD_PROJECT
  : "demo-tla-ingest";

// Valores ficticios de prueba: en runtime salen de la configuración resuelta.
const SETTINGS = {
  phoneDefaultRegion: "ES",
  marketCountry: "ES",
  locale: "es-ES", // hardcoding-ok: valor de prueba
  dataRetentionMonths: 24,
};
const NOW = new Date("2030-01-15T10:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function fixture(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../test/fixtures/landing-lead-valid.json", import.meta.url)),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

function req(body: unknown): IngestRequest {
  const headers: Record<string, string> = { [APP_CHECK_HEADER.toLowerCase()]: "valido" };
  return { method: "POST", body, ip: "192.0.2.10", get: (name) => headers[name.toLowerCase()] };
}

async function send(handler: ReturnType<typeof createIngestLandingLeadHandler>, body: unknown) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res as unknown as IngestResponse;
    },
    set() {
      return res as unknown as IngestResponse;
    },
    json(value: unknown) {
      res.body = value;
      return res;
    },
  };
  await handler(req(body), res as unknown as IngestResponse);
  return res as { statusCode: number; body: { leadId: string; deduplicated: boolean } };
}

describe.skipIf(EMULATOR_HOST === "")("ingestLandingLead contra el emulador de Firestore", () => {
  let app: App;
  let db: Firestore;
  const clock = { now: NOW };

  const handler = () =>
    createIngestLandingLeadHandler({
      settings: () => SETTINGS,
      verifyAppCheck: async () => true,
      ipHashSalt: () => "salt-de-prueba",
      newId: () => ulid(clock.now.getTime()),
      now: () => clock.now,
      runIngestTransaction: (request) => runIngestTransaction(db, request),
      log: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });

  const count = async (collection: string) => (await db.collection(collection).get()).size;

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT_ID }, "ingest-emulator-test");
    db = getFirestore(app);
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  beforeEach(async () => {
    clock.now = NOW;
    const url = `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
    const response = await fetch(url, { method: "DELETE" });
    expect(response.ok).toBe(true);
  });

  it("dos envíos iguales en paralelo crean un solo lead y un solo dedupe", async () => {
    const ingest = handler();
    const [a, b] = await Promise.all([send(ingest, fixture()), send(ingest, fixture())]);

    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(a.body.leadId).toBe(b.body.leadId);
    expect([a.body.deduplicated, b.body.deduplicated].sort()).toEqual([false, true]);
    expect(await count(LEADS_COLLECTION)).toBe(1);
    expect(await count(DEDUPE_COLLECTION)).toBe(1);
    expect(await count(CONSENTS_COLLECTION)).toBe(1);
    const events = await db
      .collection(LEADS_COLLECTION)
      .doc(a.body.leadId)
      .collection(LEAD_EVENTS_SUBCOLLECTION)
      .get();
    expect(events.docs.map((doc) => doc.get("type")).sort()).toEqual(["created", "reengaged"]);
  });

  it("lead abierto de hace 30 días: reengaged con la nueva atribución y la original intacta", async () => {
    const ingest = handler();
    clock.now = new Date(NOW.getTime() - 30 * DAY_MS);
    const first = await send(ingest, fixture());
    clock.now = NOW;
    const second = await send(ingest, {
      ...fixture(),
      landingSlug: "otra-landing",
      attribution: { utmSource: "newsletter" },
    });

    expect(second.body).toEqual({ leadId: first.body.leadId, deduplicated: true });
    const lead = await db.collection(LEADS_COLLECTION).doc(first.body.leadId).get();
    expect(lead.get("attribution.landingSlug")).toBe("landing-qa-1");
    expect(lead.get("attribution.utmSource")).toBe("facebook");
    const reengaged = await db
      .collection(LEADS_COLLECTION)
      .doc(first.body.leadId)
      .collection(LEAD_EVENTS_SUBCOLLECTION)
      .where("type", "==", "reengaged")
      .get();
    expect(reengaged.docs.map((doc) => doc.get("attribution"))).toEqual([
      { utmSource: "newsletter", landingSlug: "otra-landing" },
    ]);
  });

  it("lead anterior lost o de hace más de 90 días: lead nuevo y dedupe apuntando a él", async () => {
    const ingest = handler();
    const first = await send(ingest, fixture());
    await db.collection(LEADS_COLLECTION).doc(first.body.leadId).update({ status: "lost" });
    const second = await send(ingest, fixture());
    expect(second.body.deduplicated).toBe(false);
    expect(second.body.leadId).not.toBe(first.body.leadId);

    clock.now = new Date(NOW.getTime() + 91 * DAY_MS);
    const third = await send(ingest, fixture());
    expect(third.body.deduplicated).toBe(false);
    expect(await count(LEADS_COLLECTION)).toBe(3);
    const dedupe = await db.collection(DEDUPE_COLLECTION).get();
    expect(dedupe.docs.map((doc) => doc.get("leadId"))).toEqual([third.body.leadId]);
  });
});
