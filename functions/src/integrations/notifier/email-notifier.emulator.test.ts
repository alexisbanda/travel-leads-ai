import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ulid } from "../../domain/ulid.js";
import { fakeLeadDoc } from "../../tasks/fake-lead.js";
import {
  createEmailNotifier,
  createFirestoreMailStore,
  MAIL_COLLECTION,
  type NotifyLeadInput,
} from "./index.js";

// Locales de prueba: en runtime salen de la configuración resuelta.
const ES_LOCALE = "es-XX"; // hardcoding-ok: valor de prueba

/**
 * Integración con el emulador de Firestore: `pnpm --filter functions test:emulator`.
 * Sin `FIRESTORE_EMULATOR_HOST` se salta. Proyecto `demo-*`: nunca toca proyectos reales.
 */
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const PROJECT_ID = process.env.GCLOUD_PROJECT?.startsWith("demo-")
  ? process.env.GCLOUD_PROJECT
  : "demo-tla-ingest";

describe.skipIf(EMULATOR_HOST === "")("email notifier contra el emulador de Firestore", () => {
  let app: App;
  let db: Firestore;

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT_ID }, "email-notifier-emulator-test");
    db = getFirestore(app);
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  it("dos envíos del mismo lead dejan un solo documento en mail", async () => {
    const leadId = ulid();
    const notifier = createEmailNotifier(
      { channel: "email", target: "secret:AGENCY_NOTIFY_TARGET" },
      { locale: ES_LOCALE, readTarget: () => "uno@example.test, dos@example.test" },
      { mail: createFirestoreMailStore(() => db), now: () => new Date() },
    );
    const lead = fakeLeadDoc(leadId) as unknown as NotifyLeadInput;

    await notifier.notify({ kind: "lead_created", lead });
    await expect(notifier.notify({ kind: "lead_created", lead })).resolves.toEqual({
      status: "sent",
    });

    const snap = await db.collection(MAIL_COLLECTION).get();
    const docs = snap.docs.filter((doc) => doc.id.endsWith(leadId));
    expect(docs.map((doc) => doc.id)).toEqual([`lead-created-${leadId}`]);
    const data = docs[0]?.data();
    expect(data?.to).toEqual(["uno@example.test", "dos@example.test"]);
    expect(data?.message.subject).toMatch(/^Nuevo lead · /);
    expect(data?.expireAt.toDate()).toBeInstanceOf(Date);
  });
});
