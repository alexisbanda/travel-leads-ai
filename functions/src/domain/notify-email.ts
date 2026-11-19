// Email de aviso interno de un lead nuevo (ticket #16). Lógica pura: sin Firebase.
//
// El idioma es el de la agencia (`agency.locale`) o, si falta, el del mercado. Los
// textos se eligen por idioma base (`es`, `en`) con `en` como respaldo. El enlace al
// CRM no se puede construir desde la configuración: si el lead tiene deal, se muestra
// su id.
import type { Lead } from "@tla/shared";

/** Datos del lead que usa el email. */
export type LeadCreatedEmailInput = Pick<Lead, "leadId" | "source" | "interest"> & {
  contact: Pick<Lead["contact"], "name">;
  crm?: Lead["crm"];
};

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

interface EmailTexts {
  subjectPrefix: string;
  intro: string;
  name: string;
  travelMonth: string;
  pax: string;
  products: string;
  source: string;
  leadId: string;
  crmDeal: string;
  notProvided: string;
  noProducts: string;
  adults: (count: number) => string;
  children: (count: number) => string;
}

const TEXTS = {
  es: {
    subjectPrefix: "Nuevo lead",
    intro: "Ha entrado un lead nuevo.",
    name: "Nombre",
    travelMonth: "Mes de viaje",
    pax: "Personas",
    products: "Productos",
    source: "Origen",
    leadId: "leadId",
    crmDeal: "Deal en el CRM",
    notProvided: "sin indicar",
    noProducts: "sin producto",
    adults: (n) => `${n} ${n === 1 ? "adulto" : "adultos"}`,
    children: (n) => `${n} ${n === 1 ? "niño" : "niños"}`,
  },
  en: {
    subjectPrefix: "New lead",
    intro: "A new lead has come in.",
    name: "Name",
    travelMonth: "Travel month",
    pax: "Travellers",
    products: "Products",
    source: "Source",
    leadId: "leadId",
    crmDeal: "CRM deal",
    notProvided: "not provided",
    noProducts: "no product",
    adults: (n) => `${n} ${n === 1 ? "adult" : "adults"}`,
    children: (n) => `${n} ${n === 1 ? "child" : "children"}`,
  },
} satisfies Record<string, EmailTexts>;

const FALLBACK_LANGUAGE = "en";

/** Idioma de los avisos internos: `agency.locale` o, si falta, el locale del mercado. */
export function notifyLocale(config: {
  agency: { locale?: string | undefined };
  market: { locale: string };
}): string {
  return config.agency.locale ?? config.market.locale;
}

function textsFor(locale: string): EmailTexts {
  const base = locale.split("-")[0]?.toLowerCase() ?? "";
  return base in TEXTS ? TEXTS[base as keyof typeof TEXTS] : TEXTS[FALLBACK_LANGUAGE];
}

/** `AAAA-MM` → «marzo de 2027» según el locale; si el locale no es válido, el valor tal cual. */
function formatTravelMonth(month: string, locale: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  if (year === undefined || monthNumber === undefined) return month;
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  } catch {
    return month;
  }
}

/** Escapa un valor para insertarlo en HTML. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Email del aviso de lead nuevo en el idioma de `locale`. */
export function buildLeadCreatedEmail(lead: LeadCreatedEmailInput, locale: string): EmailContent {
  const t = textsFor(locale);
  const { interest } = lead;
  const products = interest.tourIds.length > 0 ? interest.tourIds.join(", ") : t.noProducts;
  const pax =
    interest.pax === undefined
      ? t.notProvided
      : `${t.adults(interest.pax.adults)}, ${t.children(interest.pax.children)}`;
  const month =
    interest.travelMonth === undefined
      ? t.notProvided
      : formatTravelMonth(interest.travelMonth, locale);
  const dealId = lead.crm?.dealId;

  const rows: Array<[label: string, value: string]> = [
    [t.name, lead.contact.name],
    [t.travelMonth, month],
    [t.pax, pax],
    [t.products, products],
    [t.source, lead.source],
    [t.leadId, lead.leadId],
    ...(dealId !== undefined && dealId !== "" ? [[t.crmDeal, dealId] as [string, string]] : []),
  ];

  const subject = `${t.subjectPrefix} · ${products} · ${lead.source}`;
  const text = [t.intro, "", ...rows.map(([label, value]) => `${label}: ${value}`)].join("\n");
  const html = [
    `<p>${escapeHtml(t.intro)}</p>`,
    "<table>",
    ...rows.map(
      ([label, value]) =>
        `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    ),
    "</table>",
  ].join("\n");
  return { subject, text, html };
}

/** Destinatarios del valor de un secreto: separados por comas o saltos de línea. */
export function parseRecipients(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((address) => address.trim())
    .filter((address) => address !== "");
}
