// Persistencia de las tareas de un lead: lectura del lead y eventos en `leads/{leadId}/events`.
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { LeadEvent } from "@tla/shared";
import type { CrmUpsertResult } from "../integrations/crm/index.js";
import { defaultAdminApp } from "../integrations/firebase-app.js";
import {
  CONSENTS_COLLECTION,
  LEAD_EVENTS_SUBCOLLECTION,
  LEADS_COLLECTION,
} from "../integrations/landing-lead-store.js";

export interface LeadTaskStore {
  /** Datos del lead (marcas de tiempo como `Date`) o `null` si no existe. */
  loadLead(leadId: string): Promise<Record<string, unknown> | null>;
  /** Documento `consents/{consentId}` (marcas de tiempo como `Date`) o `null` si no existe. */
  loadConsent(consentId: string): Promise<Record<string, unknown> | null>;
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

/**
 * Firestore devuelve `Timestamp`; los esquemas de `@tla/shared` esperan `Date`.
 * Convierte en profundidad (p. ej. `createdAt` o `attribution.firstTouchAt`).
 */
export function timestampsToDates(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(timestampsToDates);
  if (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, timestampsToDates(inner)]),
    );
  }
  return value;
}

function plainData(data: Record<string, unknown> | undefined): Record<string, unknown> | null {
  return data === undefined ? null : (timestampsToDates(data) as Record<string, unknown>);
}

function defaultDb(): Firestore {
  return getFirestore(defaultAdminApp());
}

export function createFirestoreLeadTaskStore(db: () => Firestore = defaultDb): LeadTaskStore {
  const leadRef = (leadId: string) => db().collection(LEADS_COLLECTION).doc(leadId);
  return {
    async loadLead(leadId) {
      const snap = await leadRef(leadId).get();
      return snap.exists ? plainData(snap.data()) : null;
    },
    async loadConsent(consentId) {
      const snap = await db().collection(CONSENTS_COLLECTION).doc(consentId).get();
      return snap.exists ? plainData(snap.data()) : null;
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
