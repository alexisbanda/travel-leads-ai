import { MarketPack } from "@tla/shared";

/**
 * Pack de mercado `es`: viajeros residentes en España (UE, RGPD).
 *
 * Fuente: docs/08-seguridad-y-cumplimiento.md (sección «Pack de mercado UE / España»)
 * y docs/11-instancias-y-configuracion.md.
 *
 * BORRADOR: `aiDisclosure` y `legalTexts` llevan `version: "draft"` y están
 * pendientes de revisión legal. No se pueden usar en una instancia `pilot` o
 * `active` hasta que un abogado del mercado los revise y se publique una versión.
 *
 * Marcador de plantilla: `{brand}` en `aiDisclosure.text` se sustituye al
 * resolver la configuración por `brand.displayName` de la instancia.
 */
export const es: MarketPack = MarketPack.parse({
  country: "ES",
  locale: "es-ES",
  currency: "EUR",
  timezone: "Europe/Madrid",
  phoneDefaultRegion: "ES",
  businessHours: {
    start: "09:00",
    end: "21:00",
    days: [1, 2, 3, 4, 5, 6],
  },
  legalRegime: "gdpr",
  // Solo regiones de Google Cloud en Estados miembros de la UE (se excluyen
  // Londres y Zúrich, fuera de la UE).
  dataRegions: [
    "europe-southwest1",
    "europe-west1",
    "europe-west3",
    "europe-west4",
    "europe-west8",
    "europe-west9",
    "europe-west10",
    "europe-west12",
    "europe-north1",
    "europe-north2",
    "europe-central2",
  ],
  bigqueryLocation: "EU",
  dataRetentionMonths: 24,
  internationalTransferWithoutAdequacy: "scc",
  aiDisclosure: {
    version: "draft",
    text:
      "Hola, soy un asistente de IA de {brand}. Te ayudo a preparar tu viaje con información " +
      "orientativa y, cuando haga falta, te paso con una persona del equipo.",
  },
  legalTexts: {
    version: "draft",
    privacyNotice:
      "Usaremos tus datos para responder a tu solicitud de información sobre el viaje y, si lo " +
      "aceptas, para enviarte novedades. La base legal es tu consentimiento. Tus datos pueden " +
      "transferirse a la agencia del destino con cláusulas contractuales tipo. Puedes ejercer tus " +
      "derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad, y " +
      "reclamar ante la Agencia Española de Protección de Datos. Más información en la política " +
      "de privacidad.",
    commercialConsent:
      "Acepto que me contacten por WhatsApp, correo electrónico o teléfono para responder a mi " +
      "solicitud de información sobre el viaje.",
    marketingConsent:
      "Quiero recibir ideas y propuestas de viaje. Puedo retirar este consentimiento en " +
      "cualquier momento.",
    cookieBanner:
      "Usamos cookies propias y de terceros para medir y mejorar nuestra publicidad. Puedes " +
      "aceptarlas, rechazarlas o configurarlas. Si las rechazas, solo usamos las necesarias.",
    // BORRADOR: páginas legales genéricas, pendientes de revisión por un abogado del
    // mercado. No publicar en una instancia `pilot` o `active` sin esa revisión.
    pages: [
      {
        slug: "privacidad",
        title: "Política de privacidad (borrador)",
        body:
          "Borrador pendiente de revisión legal. Esta página describirá qué datos personales " +
          "recogemos, con qué finalidad los tratamos, con quién los compartimos (incluida la " +
          "agencia del destino) y cómo puedes ejercer tus derechos de acceso, rectificación, " +
          "supresión, oposición, limitación y portabilidad.",
      },
      {
        slug: "cookies",
        title: "Política de cookies (borrador)",
        body:
          "Borrador pendiente de revisión legal. Esta página describirá las cookies propias y " +
          "de terceros que usamos, su finalidad y cómo puedes aceptarlas, rechazarlas o " +
          "configurarlas desde el panel de preferencias.",
      },
      {
        slug: "aviso-legal",
        title: "Aviso legal (borrador)",
        body:
          "Borrador pendiente de revisión legal. Esta página describirá la identidad del " +
          "titular del sitio, sus datos de contacto y las condiciones generales de uso.",
      },
    ],
  },
  priceDisclaimer:
    "Precio orientativo, sujeto a confirmación por la agencia. No es una oferta ni una reserva.",
  agentTone:
    "Español de España (es-ES), tuteo cercano y profesional, sin jerga ni exceso de formalidad. " +
    "Mensajes breves (2–4 frases) y una sola pregunta por mensaje. Sin emojis salvo que el " +
    "viajero los use primero.",
  locked: [
    "legalRegime",
    "dataRegions",
    "bigqueryLocation",
    "internationalTransferWithoutAdequacy",
    "aiDisclosure",
    "legalTexts",
    "priceDisclaimer",
  ],
});
