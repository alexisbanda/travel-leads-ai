// Persistencia de las tareas de un lead: lectura del lead y eventos en `leads/{leadId}/events`.
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { LeadEvent } from "@tla/shared";
import type { CrmUpsertResult } from "../integrations/crm/index.js";
import { LEAD_EVENTS_SUBCOLLECTION, LEADS_COLLECTION } from "../integrations/landing-lead-store.js";

export interface LeadTaskStore {
  /** Datos del lead o `null` si no existe. */
  loadLead(leadId: string): Promise<Record<string, unknown> | null>;
  /** Crea el evento `events/{eventId}`. */
  addEvent(leadId: string, eventId: string, event: LeadEvent): Promise<void>;
  /** Guarda `crm.contactId`, `crm.dealId` y `updatedAt` junto al evento, en un mismo batch. */
  saveCrmIds(
    leadId: string,
    ids: CrmUpsertResult,
    eventId: string,
    event: LeadEvent,
  ): Promise<void>;
}

function defaultDb(): Firestore {
  if (getApps().length === 0) initializeApp();
  return getFirestore();
}

export function createFirestoreLeadTaskStore(db: () => Firestore = defaultDb): LeadTaskStore {
  const leadRef = (leadId: string) => db().collection(LEADS_COLLECTION).doc(leadId);
  return {
    async loadLead(leadId) {
      const snap = await leadRef(leadId).get();
      return snap.exists ? (snap.data() ?? null) : null;
    },
    async addEvent(leadId, eventId, event) {
      await leadRef(leadId).collection(LEAD_EVENTS_SUBCOLLECTION).doc(eventId).create(event);
    },
    async saveCrmIds(leadId, ids, eventId, event) {
      const ref = leadRef(leadId);
      const batch = db().batch();
      batch.update(ref, {
        "crm.contactId": ids.contactId,
        "crm.dealId": ids.dealId,
        updatedAt: event.at,
      });
      batch.create(ref.collection(LEAD_EVENTS_SUBCOLLECTION).doc(eventId), event);
      await batch.commit();
    },
  };
}
