import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ConfigSla } from "@tla/shared";
import { ulid } from "../domain/ulid.js";
import {
  createEmailNotifier,
  createFirestoreMailStore,
  MAIL_COLLECTION,
  type NotifierResolution,
  type NotifyRecipient,
} from "../integrations/notifier/index.js";
import { LEAD_EVENTS_SUBCOLLECTION, LEADS_COLLECTION } from "../integrations/landing-lead-store.js";
import { fakeLeadDoc } from "../tasks/fake-lead.js";
import { createSlaWatchdogHandler, type SlaWatchdogDeps } from "./sla-watchdog.js";
import {
  CONFIG_COLLECTION,
  CONFIG_SLA_DOC,
  createFirestoreSlaWatchdogStore,
} from "./sla-watchdog-store.js";

// Zona, horario y locale de prueba; en runtime salen de `config/sla` y de la instancia.
const TZ = "Europe/Madrid"; // hardcoding-ok: valor de prueba
const ES_LOCALE = "es-XX"; // hardcoding-ok: valor de prueba
const SLA: ConfigSla = {
  warnAfterMinutes: 10,
  breachAfterMinutes: 30,
  businessHours: { start: "09:00", end: "21:00", days: [1, 2, 3, 4, 5, 6] },
  timezone: TZ,
};

/**
 * Integración con el emulador de Firestore: `pnpm --filter functions test:emulator`.
 * Sin `FIRESTORE_EMULATOR_HOST` se salta. Proyecto `demo-*`: nunca toca proyectos reales.
 * Cada caso usa un «ahora» propio en 2031, lejos de los leads de otros tests.
 */
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const PROJECT_ID = process.env.GCLOUD_PROJECT?.startsWith("demo-")
  ? process.env.GCLOUD_PROJECT
  : "demo-tla-ingest";

describe.skipIf(EMULATOR_HOST === "")("slaWatchdog contra el emulador de Firestore", () => {
  let app: App;
  let db: Firestore;

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT_ID }, "sla-watchdog-emulator-test");
    db = getFirestore(app);
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  function deps(now: Date): SlaWatchdogDeps {
    const mail = createFirestoreMailStore(() => db);
    const notifier = (recipient: NotifyRecipient): NotifierResolution => ({
      status: "ready",
      channel: "email",
      notifier: createEmailNotifier(
        { channel: "email", target: `secret:${recipient.toUpperCase()}_NOTIFY_TARGET` },
        { locale: ES_LOCALE, readTarget: () => `${recipient}@example.test` },
        { mail, now: () => now },
      ),
    });
    return {
      store: createFirestoreSlaWatchdogStore(() => db),
      notifier,
      fallbackSla: () => SLA,
      now: () => now,
      newId: () => ulid(),
      log: { info: () => {}, warn: () => {}, error: () => {} },
    };
  }

  async function seedLead(createdAt: Date) {
    const leadId = ulid();
    await db
      .collection(LEADS_COLLECTION)
      .doc(leadId)
      .set({ ...fakeLeadDoc(leadId), createdAt, updatedAt: createdAt });
    return leadId;
  }

  async function mailIds(leadId: string) {
    const snap = await db.collection(MAIL_COLLECTION).get();
    return snap.docs
      .map((doc) => doc.id)
      .filter((id) => id.endsWith(leadId))
      .sort();
  }

  it("tres ejecuciones seguidas dejan un solo documento de mail por nivel y marcan el lead", async () => {
    await db.collection(CONFIG_COLLECTION).doc(CONFIG_SLA_DOC).set(SLA);
    // Martes 14/01/2031, 11:00 locales.
    const now = new Date("2031-01-14T10:00:00Z");
    const leadId = await seedLead(new Date(now.getTime() - 31 * 60_000));

    const run = createSlaWatchdogHandler(deps(now));
    await run();
    await run();
    await run();

    expect(await mailIds(leadId)).toEqual([`sla-breach-${leadId}`, `sla-warning-${leadId}`]);
    const mail = await db.collection(MAIL_COLLECTION).doc(`sla-warning-${leadId}`).get();
    expect(mail.data()?.to).toEqual(["partner@example.test"]);

    const lead = (await db.collection(LEADS_COLLECTION).doc(leadId).get()).data();
    expect(lead?.sla.warnedAt.toDate()).toEqual(now);
    expect(lead?.sla.breachedAt.toDate()).toEqual(now);
    expect(lead?.status).toBe("new");

    const events = await db
      .collection(LEADS_COLLECTION)
      .doc(leadId)
      .collection(LEAD_EVENTS_SUBCOLLECTION)
      .get();
    expect(events.docs.map((doc) => doc.data().type).sort()).toEqual([
      "sla.breached",
      "sla.warned",
    ]);
  });

  it("cambiar config/sla entre ejecuciones cambia los umbrales sin redesplegar", async () => {
    await db.collection(CONFIG_COLLECTION).doc(CONFIG_SLA_DOC).set(SLA);
    // Martes 21/01/2031, 11:00 locales.
    const now = new Date("2031-01-21T10:00:00Z");
    const leadId = await seedLead(new Date(now.getTime() - 6 * 60_000));

    await createSlaWatchdogHandler(deps(now))();
    expect(await mailIds(leadId)).toEqual([]);

    await db
      .collection(CONFIG_COLLECTION)
      .doc(CONFIG_SLA_DOC)
      .set({ ...SLA, warnAfterMinutes: 5, breachAfterMinutes: 30 });
    await createSlaWatchdogHandler(deps(now))();
    expect(await mailIds(leadId)).toEqual([`sla-warning-${leadId}`]);

    await db.collection(CONFIG_COLLECTION).doc(CONFIG_SLA_DOC).set(SLA);
  });

  it("la marca no se escribe si el lead cambió desde que se leyó", async () => {
    const store = createFirestoreSlaWatchdogStore(() => db);
    const now = new Date("2031-01-28T10:00:00Z");
    const leadId = await seedLead(new Date(now.getTime() - 31 * 60_000));
    const [candidate] = await store.listCandidates({
      createdFrom: new Date(now.getTime() - 60 * 60_000),
      createdTo: now,
      limit: 10,
    });
    expect(candidate?.leadId).toBe(leadId);

    await db.collection(LEADS_COLLECTION).doc(leadId).update({ status: "contacted" });
    const result = await store.markLevel(leadId, candidate?.version, {
      level: "warning",
      at: now,
      eventId: ulid(),
      event: { type: "sla.warned", actor: "system", at: now },
    });
    expect(result).toEqual({ status: "conflict" });
    const lead = (await db.collection(LEADS_COLLECTION).doc(leadId).get()).data();
    expect(lead?.sla).toBeUndefined();
  });
});
