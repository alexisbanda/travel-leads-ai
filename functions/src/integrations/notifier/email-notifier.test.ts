import { describe, expect, it } from "vitest";
import { fakeLeadDoc, TEST_LEAD_ID, TEST_NOW } from "../../tasks/fake-lead.js";
import {
  createEmailNotifier,
  MAIL_TTL_DAYS,
  type MailDoc,
  type MailStore,
  type NotifyLeadInput,
  type NotifyMessage,
} from "./index.js";

// Locales de prueba: en runtime salen de la configuración resuelta.
const ES_LOCALE = "es-XX"; // hardcoding-ok: valor de prueba

const target = { channel: "email" as const, target: "secret:AGENCY_NOTIFY_TARGET" };

function memoryMail() {
  const docs = new Map<string, MailDoc>();
  const store: MailStore = {
    createOnce: async (id, doc) => {
      if (docs.has(id)) return "exists";
      docs.set(id, doc);
      return "created";
    },
  };
  return { docs, store };
}

const message: NotifyMessage = {
  kind: "lead_created",
  lead: {
    ...(fakeLeadDoc() as unknown as NotifyLeadInput),
    interest: {
      tourIds: ["tour-ficticio"],
      travelMonth: "2027-03",
      pax: { adults: 2, children: 0 },
    },
  },
};

function notifier(secret: string, from?: string) {
  const mail = memoryMail();
  const n = createEmailNotifier(
    target,
    { locale: ES_LOCALE, from, readTarget: () => secret },
    { mail: mail.store, now: () => TEST_NOW },
  );
  return { mail, n };
}

describe("email notifier", () => {
  it("escribe en mail con los destinatarios del secreto, id determinista y expireAt a 7 días", async () => {
    const { mail, n } = notifier(" uno@example.test,\ndos@example.test , ", "avisos@example.test");
    await expect(n.notify(message)).resolves.toEqual({ status: "sent" });
    const doc = mail.docs.get(`lead-created-${TEST_LEAD_ID}`);
    expect(doc?.to).toEqual(["uno@example.test", "dos@example.test"]);
    expect(doc?.from).toBe("avisos@example.test");
    expect(doc?.message.subject).toBe("Nuevo lead · tour-ficticio · landing");
    expect(doc?.message.text).toContain(TEST_LEAD_ID);
    expect(doc?.expireAt).toEqual(
      new Date(TEST_NOW.getTime() + MAIL_TTL_DAYS * 24 * 60 * 60 * 1000),
    );
  });

  it("sin remitente no escribe from (usa el de la extensión)", async () => {
    const { mail, n } = notifier("uno@example.test", "  ");
    await n.notify(message);
    expect(mail.docs.get(`lead-created-${TEST_LEAD_ID}`)).not.toHaveProperty("from");
  });

  it("sin destinatarios no escribe nada y devuelve skipped no_recipients", async () => {
    const { mail, n } = notifier(" , \n ");
    await expect(n.notify(message)).resolves.toEqual({
      status: "skipped",
      reason: "no_recipients",
    });
    expect(mail.docs.size).toBe(0);
  });

  it("un reintento no duplica el documento y cuenta como enviado", async () => {
    const { mail, n } = notifier("uno@example.test");
    await n.notify(message);
    await expect(n.notify(message)).resolves.toEqual({ status: "sent" });
    expect(mail.docs.size).toBe(1);
  });

  it("si la escritura falla, lanza para que Cloud Tasks reintente", async () => {
    const n = createEmailNotifier(
      target,
      { locale: ES_LOCALE, readTarget: () => "uno@example.test" },
      {
        mail: {
          createOnce: async () => {
            throw new TypeError("x");
          },
        },
        now: () => TEST_NOW,
      },
    );
    await expect(n.notify(message)).rejects.toBeInstanceOf(TypeError);
  });

  it("los avisos del SLA usan un documento por nivel y no llevan datos de contacto", async () => {
    const { mail, n } = notifier("uno@example.test");
    const lead = {
      leadId: TEST_LEAD_ID,
      source: "landing" as const,
      contact: { name: "Persona Ficticia" },
    };
    const sla = (level: "warning" | "breach"): NotifyMessage => ({
      kind: "sla",
      level,
      lead,
      businessMinutes: level === "warning" ? 11 : 31,
      thresholdMinutes: level === "warning" ? 10 : 30,
    });
    await n.notify(sla("warning"));
    await n.notify(sla("warning"));
    await n.notify(sla("breach"));
    expect([...mail.docs.keys()]).toEqual([
      `sla-warning-${TEST_LEAD_ID}`,
      `sla-breach-${TEST_LEAD_ID}`,
    ]);
    expect(mail.docs.get(`sla-warning-${TEST_LEAD_ID}`)?.message.subject).toBe(
      "SLA en riesgo · 11 min sin respuesta · landing",
    );
    expect(mail.docs.get(`sla-breach-${TEST_LEAD_ID}`)?.message.text).not.toContain("@");
  });
});
