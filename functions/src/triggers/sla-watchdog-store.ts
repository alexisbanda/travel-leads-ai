// Persistencia de `slaWatchdog` (spec 005): lectura de `config/sla`, consulta de
// candidatos y marca de cada nivel del SLA en el lead, junto con su evento.
import {
  getFirestore,
  Timestamp,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import type { LeadEvent, SlaLevel } from "@tla/shared";
import { defaultAdminApp } from "../integrations/firebase-app.js";
import { LEAD_EVENTS_SUBCOLLECTION, LEADS_COLLECTION } from "../integrations/landing-lead-store.js";

/** Colección de configuración operativa (`pnpm instance:seed`, doc 02). */
export const CONFIG_COLLECTION = "config";
/** Documento con los umbrales y el horario del SLA. */
export const CONFIG_SLA_DOC = "sla";

/** Lead candidato: datos con las marcas de tiempo como `Date` y su versión para la marca. */
export interface SlaCandidate {
  leadId: string;
  data: Record<string, unknown>;
  /** Versión opaca del documento leído: la marca solo se escribe si no ha cambiado. */
  version: unknown;
}

export interface SlaMarkRequest {
  level: SlaLevel;
  at: Date;
  eventId: string;
  event: LeadEvent;
}

/** Página de candidatos; `cursor` presente si puede haber más. */
export interface SlaCandidatePage {
  candidates: SlaCandidate[];
  cursor?: unknown;
}

export type SlaMarkResult = { status: "marked"; version: unknown } | { status: "conflict" };

export interface SlaWatchdogStore {
  /** Documento `config/sla` (sin validar) o `null` si no existe. */
  loadSlaConfig(): Promise<unknown>;
  /**
   * Una página de leads `new` con `createdAt` en `[createdFrom, createdTo]`, los más
   * antiguos primero. `cursor` es el de la página anterior.
   */
  listCandidates(query: {
    createdFrom: Date;
    createdTo: Date;
    limit: number;
    cursor?: unknown;
  }): Promise<SlaCandidatePage>;
  /**
   * Escribe en un batch `sla.warnedAt` o `sla.breachedAt`, `updatedAt` y el evento.
   * `conflict` si el lead cambió desde que se leyó con `version`.
   */
  markLevel(leadId: string, version: unknown, mark: SlaMarkRequest): Promise<SlaMarkResult>;
}

/** Campo del lead que cierra cada nivel. */
export const SLA_MARK_FIELDS: Record<SlaLevel, "sla.warnedAt" | "sla.breachedAt"> = {
  warning: "sla.warnedAt",
  breach: "sla.breachedAt",
};

/** Código gRPC `FAILED_PRECONDITION`: el documento cambió desde `lastUpdateTime`. */
const GRPC_FAILED_PRECONDITION = 9;

/** Firestore devuelve `Timestamp`; los esquemas de `@tla/shared` esperan `Date`. */
export function firestoreDatesToDates(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(firestoreDatesToDates);
  if (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, firestoreDatesToDates(inner)]),
    );
  }
  return value;
}

function defaultDb(): Firestore {
  return getFirestore(defaultAdminApp());
}

export function createFirestoreSlaWatchdogStore(db: () => Firestore = defaultDb): SlaWatchdogStore {
  return {
    async loadSlaConfig() {
      const snap = await db().collection(CONFIG_COLLECTION).doc(CONFIG_SLA_DOC).get();
      return snap.exists ? (snap.data() ?? null) : null;
    },

    async listCandidates({ createdFrom, createdTo, limit, cursor }) {
      let query = db()
        .collection(LEADS_COLLECTION)
        .where("status", "==", "new")
        .where("createdAt", ">=", createdFrom)
        .where("createdAt", "<=", createdTo)
        .orderBy("createdAt")
        .limit(limit);
      if (cursor !== undefined) query = query.startAfter(cursor as QueryDocumentSnapshot);
      const snap = await query.get();
      const candidates = snap.docs.map((doc) => ({
        leadId: doc.id,
        data: firestoreDatesToDates(doc.data()) as Record<string, unknown>,
        version: doc.updateTime,
      }));
      const last = snap.docs.at(-1);
      return snap.docs.length === limit && last !== undefined
        ? { candidates, cursor: last }
        : { candidates };
    },

    async markLevel(leadId, version, { level, at, eventId, event }) {
      const leadRef = db().collection(LEADS_COLLECTION).doc(leadId);
      const batch = db().batch();
      batch.update(
        leadRef,
        { [SLA_MARK_FIELDS[level]]: at, updatedAt: at },
        { lastUpdateTime: version as Timestamp },
      );
      batch.create(leadRef.collection(LEAD_EVENTS_SUBCOLLECTION).doc(eventId), event);
      try {
        const [leadWrite] = await batch.commit();
        return { status: "marked", version: leadWrite?.writeTime };
      } catch (error) {
        if ((error as { code?: unknown } | null)?.code === GRPC_FAILED_PRECONDITION) {
          return { status: "conflict" };
        }
        throw error;
      }
    },
  };
}
