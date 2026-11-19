import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { MetaLeadSettings } from "../domain/meta-lead.js";
import { ulid } from "../domain/ulid.js";
import { INBOX_COLLECTION } from "../http/meta-lead-webhook.js";
import {
  CONSENTS_COLLECTION,
  DEDUPE_COLLECTION,
  LEAD_EVENTS_SUBCOLLECTION,
  LEADS_COLLECTION,
  runIngestTransaction,
} from "../integrations/landing-lead-store.js";
import { MetaGraphApiError } from "../integrations/meta-graph-api.js";
import {
  createFirestoreInboxErrorMarker,
  createProcessMetaInboxHandler,
  type ProcessMetaInboxDeps,
} from "./process-meta-inbox.js";

/**
 * Integración con el emulador de Firestore: `pnpm --filter functions test:emulator`.
 * Sin `FIRESTORE_EMULATOR_HOST` se salta. Proyecto `demo-*`: nunca toca proyectos reales.
 * La Graph API se simula: cada test decide su respuesta.
 */
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const PROJECT_ID = process.env.GCLOUD_PROJECT?.startsWith("demo-")
  ? process.env.GCLOUD_PROJECT
  : "demo-tla-ingest";

// Valores ficticios de prueba: en runtime salen de la configuración resuelta.
const PHONE_E164 = "+34600000000"; // hardcoding-ok: número ficticio de pruebas
const SETTINGS: MetaLeadSettings = {
  phoneDefaultRegion: "ES",
  marketCountry: "ES",
  locale: "es-ES", // hardcoding-ok: valor de prueba
  dataRetentionMonths: 24,
  legalTextsVersion: "1.0.0",
  fieldMap: {
    cuando_quieres_viajar: { field: "travelMonth", values: { marzo_2027: "2027-03" } },
    cuantos_adultos: "paxAdults",
    tipo_de_viaje: { field: "segment", values: { en_pareja: "couple" } },
    comentarios: "notes",
    quiere_ofertas: { field: "marketingConsent", values: { si: true, no: false } },
  },
};
const NOW = new Date("2030-01-15T10:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../test/fixtures/${name}`, import.meta.url)), "utf8"),
  ) as Record<string, unknown>;
}

/** `value` del cambio `leadgen` del fixture de entrega, con otro `leadgen_id` si se pide. */
function deliveryValue(leadgenId?: string): Record<string, unknown> {
  const delivery = readFixture("meta-leadgen-delivery.json") as {
    entry: { changes: { value: Record<string, unknown> }[] }[];
  };
  const value = delivery.entry[0]!.changes[0]!.value;
  return leadgenId === undefined ? value : { ...value, leadgen_id: leadgenId };
}

const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe.skipIf(EMULATOR_HOST === "")("processMetaInbox contra el emulador de Firestore", () => {
  let app: App;
  let db: Firestore;
  const clock = { now: NOW };
  const graph: { response: () => Promise<unknown>; calls: string[] } = {
    response: async () => readFixture("meta-graph-lead.json"),
    calls: [],
  };
  let handler: ReturnType<typeof createProcessMetaInboxHandler>;

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT_ID }, "process-meta-inbox-emulator-test");
    db = getFirestore(app);
    const deps: ProcessMetaInboxDeps = {
      settings: () => SETTINGS,
      fetchLead: (leadgenId) => {
        graph.calls.push(leadgenId);
        return graph.response();
      },
      newId: () => ulid(),
      now: () => clock.now,
      runIngestTransaction: (request) => runIngestTransaction(db, request),
      markInboxError: createFirestoreInboxErrorMarker(() => db),
      log: silent,
    };
    handler = createProcessMetaInboxHandler(deps);
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  beforeEach(async () => {
    clock.now = NOW;
    graph.response = async () => readFixture("meta-graph-lead.json");
    graph.calls = [];
    const url = `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
    const response = await fetch(url, { method: "DELETE" });
    expect(response.ok).toBe(true);
  });

  /** Escribe la entrega como lo hace el webhook y devuelve el evento del trigger. */
  async function deliver(leadgenId: string) {
    const inboxId = `meta_${leadgenId}`;
    const doc = {
      source: "meta",
      payload: deliveryValue(leadgenId),
      receivedAt: clock.now,
      expiresAt: new Date(clock.now.getTime() + 7 * DAY_MS),
    };
    await db.collection(INBOX_COLLECTION).doc(inboxId).set(doc);
    return { inboxId, after: doc as Record<string, unknown> };
  }

  async function inbox(inboxId: string) {
    return (await db.collection(INBOX_COLLECTION).doc(inboxId).get()).data() ?? {};
  }

  async function count(collection: string): Promise<number> {
    return (await db.collection(collection).get()).size;
  }

  async function events(leadId: string) {
    const snap = await db
      .collection(LEADS_COLLECTION)
      .doc(leadId)
      .collection(LEAD_EVENTS_SUBCOLLECTION)
      .get();
    return snap.docs.map((doc) => doc.data());
  }

  it("crea el lead con contacto, interés, atribución y consentimiento meta_form", async () => {
    const write = await deliver("000000000000001");
    await expect(handler(write)).resolves.toBe("created");
    expect(graph.calls).toEqual(["000000000000001"]);

    const marker = await inbox(write.inboxId);
    expect(marker).toMatchObject({ status: "processed", deduplicated: false });
    expect(marker.processedAt).toBeInstanceOf(Timestamp);
    expect(marker.error).toBeUndefined();
    const leadId = marker.leadId as string;

    const lead = (await db.collection(LEADS_COLLECTION).doc(leadId).get()).data();
    expect(lead).toMatchObject({
      leadId,
      source: "meta_lead_ad",
      status: "new",
      contact: {
        name: "Viajero Prueba",
        phoneE164: PHONE_E164,
        email: "viajero.prueba@example.com",
        country: "ES",
      },
      segment: "couple",
      interest: {
        tourIds: [],
        travelMonth: "2027-03",
        pax: { adults: 2, children: 0 },
        notes: "Texto de prueba",
      },
      attribution: {
        metaCampaignId: "000000000000500",
        metaAdsetId: "000000000000300",
        metaAdId: "000000000000200",
      },
    });

    const consent = (
      await db
        .collection(CONSENTS_COLLECTION)
        .doc(lead?.consentId as string)
        .get()
    ).data();
    expect(consent).toMatchObject({
      leadId,
      channel: "meta_form",
      purposes: ["contact", "marketing"],
      textVersion: "1.0.0",
    });
    expect(
      (
        await db
          .collection(DEDUPE_COLLECTION)
          .doc(lead?.dedupeKey as string)
          .get()
      ).data(),
    ).toMatchObject({ leadId });
    expect((await events(leadId)).map((e) => e.type)).toEqual(["created"]);
  });

  it("procesar dos veces el mismo inbox deja un solo lead y ningún reengaged", async () => {
    const write = await deliver("000000000000001");
    await expect(handler(write)).resolves.toBe("created");
    // Entrega duplicada del mismo evento (Firestore garantiza «al menos una vez»).
    await expect(handler(write)).resolves.toBe("already_processed");

    expect(await count(LEADS_COLLECTION)).toBe(1);
    expect(await count(CONSENTS_COLLECTION)).toBe(1);
    const leadId = (await inbox(write.inboxId)).leadId as string;
    expect((await events(leadId)).map((e) => e.type)).toEqual(["created"]);
  });

  it("dos entregas de la misma persona en menos de 90 días → un lead y un reengaged", async () => {
    const first = await deliver("000000000000001");
    await expect(handler(first)).resolves.toBe("created");

    clock.now = new Date(NOW.getTime() + 10 * DAY_MS);
    graph.response = async () => ({
      ...readFixture("meta-graph-lead.json"),
      ad_id: "000000000000201",
    });
    const second = await deliver("000000000000002");
    await expect(handler(second)).resolves.toBe("reengaged");

    expect(await count(LEADS_COLLECTION)).toBe(1);
    expect(await count(CONSENTS_COLLECTION)).toBe(1);
    const leadId = (await inbox(first.inboxId)).leadId as string;
    expect(await inbox(second.inboxId)).toMatchObject({
      status: "processed",
      leadId,
      deduplicated: true,
    });
    const reengaged = (await events(leadId)).find((e) => e.type === "reengaged");
    expect(reengaged).toMatchObject({
      actor: "system",
      attribution: {
        metaCampaignId: "000000000000500",
        metaAdsetId: "000000000000300",
        metaAdId: "000000000000201",
      },
    });
    // La atribución del lead no cambia.
    const lead = (await db.collection(LEADS_COLLECTION).doc(leadId).get()).data();
    expect(lead?.attribution.metaAdId).toBe("000000000000200");
  });

  it("un 500 de la Graph API deja el inbox con error y sin nada creado; pending lo reintenta", async () => {
    graph.response = async () => {
      throw new MetaGraphApiError("status", 500);
    };
    const write = await deliver("000000000000001");
    await expect(handler(write)).resolves.toBe("error");

    const failed = await inbox(write.inboxId);
    expect(failed).toMatchObject({ status: "error", attempts: 1, error: "graph_api_500" });
    expect(failed.lastAttemptAt).toBeInstanceOf(Timestamp);
    expect(failed.leadId).toBeUndefined();
    expect(await count(LEADS_COLLECTION)).toBe(0);
    expect(await count(CONSENTS_COLLECTION)).toBe(0);
    expect(await count(DEDUPE_COLLECTION)).toBe(0);

    // Reintento: alguien vuelve a poner `status: "pending"` y la Graph API ya responde.
    graph.response = async () => readFixture("meta-graph-lead.json");
    clock.now = new Date(NOW.getTime() + 60_000);
    await db.collection(INBOX_COLLECTION).doc(write.inboxId).update({ status: "pending" });
    await expect(
      handler({ inboxId: write.inboxId, after: await inbox(write.inboxId) }),
    ).resolves.toBe("created");

    const processed = await inbox(write.inboxId);
    expect(processed).toMatchObject({ status: "processed", attempts: 1, deduplicated: false });
    expect(processed.error).toBeUndefined();
    expect(await count(LEADS_COLLECTION)).toBe(1);
    expect(processed.leadId).toEqual((await db.collection(LEADS_COLLECTION).get()).docs[0]?.id);
  });
});
