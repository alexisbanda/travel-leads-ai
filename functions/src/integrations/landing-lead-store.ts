// Persistencia de la ingesta de la landing (spec 001): una sola transacción de Firestore
// que decide entre reutilizar el lead (evento `reengaged`) o crear lead, consentimiento,
// entrada de `dedupe` y evento `created`.
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { LeadStatus, type LeadEvent } from "@tla/shared";
import { isReengageable, type NewLandingLeadDocs } from "../domain/landing-lead.js";

export const LEADS_COLLECTION = "leads";
export const LEAD_EVENTS_SUBCOLLECTION = "events";
export const CONSENTS_COLLECTION = "consents";
export const DEDUPE_COLLECTION = "dedupe";

export interface IngestTransactionRequest {
  dedupeKey: string;
  now: Date;
  /** Documentos a crear si no hay lead que reutilizar. */
  newLead: NewLandingLeadDocs;
  /** Evento a añadir al lead existente si se reutiliza. */
  reengaged: { eventId: string; event: LeadEvent };
}

export interface IngestOutcome {
  leadId: string;
  deduplicated: boolean;
}

/** Firestore guarda `Timestamp`; las reglas de deduplicación trabajan con `Date`. */
function toDate(value: unknown): Date | undefined {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
}

/**
 * Ejecuta la ingesta en una transacción. Lee `dedupe/{dedupeKey}` y el lead al que
 * apunta: si sigue abierto y es reciente (`isReengageable`) añade el evento `reengaged`;
 * si no, crea todo. Firestore reintenta la transacción si otra escribe la misma entrada
 * de `dedupe` a la vez, así que dos envíos simultáneos acaban en un solo lead.
 */
export async function runIngestTransaction(
  db: Firestore,
  request: IngestTransactionRequest,
): Promise<IngestOutcome> {
  return db.runTransaction(async (tx) => {
    const leads = db.collection(LEADS_COLLECTION);
    const dedupeRef = db.collection(DEDUPE_COLLECTION).doc(request.dedupeKey);
    const dedupeSnap = await tx.get(dedupeRef);
    const existingId: unknown = dedupeSnap.exists ? dedupeSnap.get("leadId") : undefined;

    if (typeof existingId === "string" && existingId !== "") {
      const existingRef = leads.doc(existingId);
      const existingSnap = await tx.get(existingRef);
      const status = LeadStatus.safeParse(existingSnap.get("status"));
      const createdAt = toDate(existingSnap.get("createdAt"));
      if (
        existingSnap.exists &&
        status.success &&
        createdAt !== undefined &&
        isReengageable({ status: status.data, createdAt }, request.now)
      ) {
        tx.create(
          existingRef.collection(LEAD_EVENTS_SUBCOLLECTION).doc(request.reengaged.eventId),
          request.reengaged.event,
        );
        return { leadId: existingId, deduplicated: true };
      }
    }

    const { newLead } = request;
    const leadRef = leads.doc(newLead.leadId);
    tx.create(leadRef, newLead.lead);
    tx.create(db.collection(CONSENTS_COLLECTION).doc(newLead.consentId), newLead.consent);
    tx.set(dedupeRef, newLead.dedupe);
    tx.create(leadRef.collection(LEAD_EVENTS_SUBCOLLECTION).doc(newLead.eventId), newLead.event);
    return { leadId: newLead.leadId, deduplicated: false };
  });
}

function defaultDb(): Firestore {
  if (getApps().length === 0) initializeApp();
  return getFirestore();
}

/** `runIngestTransaction` sobre la app por defecto (inicializada de forma perezosa). */
export function createRunIngestTransaction(db: () => Firestore = defaultDb) {
  return (request: IngestTransactionRequest): Promise<IngestOutcome> =>
    runIngestTransaction(db(), request);
}
