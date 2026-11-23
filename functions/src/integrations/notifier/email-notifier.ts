// Aviso por email (#16): escribe en la colección `mail` que lee la extensión Trigger
// Email de Firebase. El id del documento es determinista y se crea con `create()`, así
// que un reintento de Cloud Tasks no duplica el email. Nunca registra direcciones.
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  buildLeadCreatedEmail,
  buildSlaEmail,
  parseRecipients,
  type EmailContent,
} from "../../domain/notify-email.js";
import { defaultAdminApp } from "../firebase-app.js";
import {
  notifyMessageId,
  type Notifier,
  type NotifierContext,
  type NotifyMessage,
  type NotifyTarget,
} from "./notifier.js";

/** Colección que lee la extensión Trigger Email. */
export const MAIL_COLLECTION = "mail";

/** Días que se conserva un documento de `mail` (política TTL sobre `expireAt`). */
export const MAIL_TTL_DAYS = 7;

/** Documento de `mail` en el formato de Trigger Email, más `expireAt` para el TTL. */
export interface MailDoc {
  to: string[];
  from?: string;
  message: EmailContent;
  expireAt: Date;
}

export interface MailStore {
  /** Crea `mail/{id}`; `exists` si ya estaba (reintento). */
  createOnce(id: string, doc: MailDoc): Promise<"created" | "exists">;
}

/** Código gRPC `ALREADY_EXISTS`, que devuelve `create()` si el documento ya existe. */
const GRPC_ALREADY_EXISTS = 6;

function defaultDb(): Firestore {
  return getFirestore(defaultAdminApp());
}

export function createFirestoreMailStore(db: () => Firestore = defaultDb): MailStore {
  return {
    async createOnce(id, doc) {
      try {
        await db().collection(MAIL_COLLECTION).doc(id).create(doc);
        return "created";
      } catch (error) {
        if ((error as { code?: unknown } | null)?.code === GRPC_ALREADY_EXISTS) return "exists";
        throw error;
      }
    },
  };
}

/** Id determinista del documento de `mail` de cada aviso. */
export function mailDocId(message: NotifyMessage): string {
  return notifyMessageId(message);
}

function emailFor(message: NotifyMessage, locale: string): EmailContent {
  return message.kind === "lead_created"
    ? buildLeadCreatedEmail(message.lead, locale)
    : buildSlaEmail(
        message.level,
        message.lead,
        message.businessMinutes,
        message.thresholdMinutes,
        locale,
      );
}

export interface EmailNotifierDeps {
  mail: MailStore;
  now: () => Date;
}

export function createEmailNotifier(
  _target: NotifyTarget,
  context: NotifierContext,
  deps: EmailNotifierDeps = { mail: createFirestoreMailStore(), now: () => new Date() },
): Notifier {
  return {
    async notify(message) {
      const to = parseRecipients(context.readTarget());
      if (to.length === 0) return { status: "skipped", reason: "no_recipients" };

      const expireAt = new Date(deps.now().getTime() + MAIL_TTL_DAYS * 24 * 60 * 60 * 1000);
      const from = context.from?.trim();
      await deps.mail.createOnce(mailDocId(message), {
        to,
        ...(from !== undefined && from !== "" && { from }),
        message: emailFor(message, context.locale),
        expireAt,
      });
      // `exists`: un intento anterior ya lo dejó en `mail`; cuenta como enviado.
      return { status: "sent" };
    },
  };
}
