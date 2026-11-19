import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ulid } from "../domain/ulid.js";
import { InMemoryCrmAdapter, type CrmAdapter } from "../integrations/crm/index.js";
import { LEAD_EVENTS_SUBCOLLECTION, LEADS_COLLECTION } from "../integrations/landing-lead-store.js";
import { createTaskQueueEnqueuer, type TaskQueueLike } from "../integrations/task-queue.js";
import { createOnLeadCreatedHandler } from "../triggers/on-lead-created.js";
import { fakeLeadDoc } from "./fake-lead.js";
import {
  createAgencyNotifyHandler,
  createCrmUpsertHandler,
  createMetaCapiLeadHandler,
  type LeadTaskDeps,
} from "./handlers.js";
import { createFirestoreLeadTaskStore } from "./lead-task-store.js";

/**
 * Integración con el emulador de Firestore: `pnpm --filter functions test:emulator`.
 * Sin `FIRESTORE_EMULATOR_HOST` se salta. Proyecto `demo-*`: nunca toca proyectos reales.
 * Cada test usa su propio lead (ULID nuevo) y no vacía la base: convive con otros tests.
 */
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const PROJECT_ID = process.env.GCLOUD_PROJECT?.startsWith("demo-")
  ? process.env.GCLOUD_PROJECT
  : "demo-tla-ingest";

const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe.skipIf(EMULATOR_HOST === "")("tareas de un lead contra el emulador de Firestore", () => {
  let app: App;
  let db: Firestore;
  let deps: LeadTaskDeps;

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT_ID }, "lead-tasks-emulator-test");
    db = getFirestore(app);
    deps = {
      store: createFirestoreLeadTaskStore(() => db),
      newId: () => ulid(),
      now: () => new Date(),
      log: silent,
    };
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  async function createLead(): Promise<string> {
    const leadId = ulid();
    await db.collection(LEADS_COLLECTION).doc(leadId).create(fakeLeadDoc(leadId));
    return leadId;
  }

  async function eventTypes(leadId: string): Promise<string[]> {
    const events = await db
      .collection(LEADS_COLLECTION)
      .doc(leadId)
      .collection(LEAD_EVENTS_SUBCOLLECTION)
      .get();
    return events.docs.map((doc) => doc.get("type") as string).sort();
  }

  it("al crear un lead se encola una tarea por acción activa; reencolar no duplica", async () => {
    const leadId = await createLead();
    const tasks: string[] = [];
    const queueFor = (queue: string): TaskQueueLike => ({
      async enqueue(_data, opts) {
        const key = `${queue}/${opts?.id ?? ""}`;
        if (tasks.includes(key)) {
          throw Object.assign(new Error("ya existe"), { code: "functions/task-already-exists" });
        }
        tasks.push(key);
      },
    });
    const run = (pixelId: string) =>
      createOnLeadCreatedHandler({
        config: { channels: { meta: { pixelId } } },
        enqueuer: () => createTaskQueueEnqueuer(queueFor, ""),
        now: () => new Date(),
        log: silent,
      });
    const event = { params: { leadId }, time: new Date().toISOString() };

    await run("123456")(event);
    await run("123456")(event); // entrega duplicada del trigger
    expect(tasks).toEqual([
      `crmUpsertTask/crm-upsert-${leadId}`,
      `agencyNotifyTask/agency-notify-${leadId}`,
      `metaCapiLeadTask/meta-capi-lead-${leadId}`,
    ]);

    const other = await createLead();
    tasks.length = 0;
    await run("")({ params: { leadId: other }, time: new Date().toISOString() });
    expect(tasks).toEqual([
      `crmUpsertTask/crm-upsert-${other}`,
      `agencyNotifyTask/agency-notify-${other}`,
    ]);
  });

  it("crm.upsert con el adaptador en memoria guarda crm.contactId y crm.dealId y el evento", async () => {
    const leadId = await createLead();
    const crm = new InMemoryCrmAdapter();
    await createCrmUpsertHandler({ ...deps, crm: () => crm })({ leadId });

    const lead = await db.collection(LEADS_COLLECTION).doc(leadId).get();
    expect(lead.get("crm")).toEqual({ contactId: "mem-contact-1", dealId: "mem-deal-1" });
    expect(lead.get("contact.name")).toBe("Persona Ficticia");
    expect(await eventTypes(leadId)).toEqual(["crm.upsert.succeeded"]);
  });

  it("cada tarea ejecutada añade su evento <acción>.<resultado> al lead", async () => {
    const leadId = await createLead();
    const failingCrm: CrmAdapter = {
      upsert: async () => {
        throw new RangeError("fallo simulado");
      },
    };
    await expect(
      createCrmUpsertHandler({ ...deps, crm: () => failingCrm })({ leadId }),
    ).rejects.toBeInstanceOf(RangeError);
    await createAgencyNotifyHandler({ ...deps, notifier: () => ({ status: "no_channel" }) })({
      leadId,
    });
    await createMetaCapiLeadHandler(deps)({ leadId });

    expect(await eventTypes(leadId)).toEqual([
      "agency.notify.skipped",
      "crm.upsert.failed",
      "meta.capi.lead.skipped",
    ]);
    const failed = await db
      .collection(LEADS_COLLECTION)
      .doc(leadId)
      .collection(LEAD_EVENTS_SUBCOLLECTION)
      .where("type", "==", "crm.upsert.failed")
      .get();
    expect(failed.docs.map((doc) => [doc.get("actor"), doc.get("detail")])).toEqual([
      ["system", "RangeError"],
    ]);
    const lead = await db.collection(LEADS_COLLECTION).doc(leadId).get();
    expect(lead.get("crm")).toBeUndefined();
  });
});
