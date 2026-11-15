# apps/landings

Plantilla única de landings en **Next.js (App Router) + React + TypeScript**, desplegada en **Firebase App Hosting**.

> Estado: pendiente de scaffolding (issue de la semana 1 del roadmap).

## Responsabilidades

- Generar una landing por producto, público y campaña a partir del contenido de la instancia (`instances/<id>/content/landings`).
- Formulario de captación que envía a la Function `ingestLandingLead`. **Nunca escribe en Firestore directamente.**
- Tracking: GTM, Meta Pixel y eventos de servidor (Conversions API) con `event_id` compartido para deduplicar.
- Banner de consentimiento con Consent Mode v2.
- Datos estructurados schema.org (`TouristTrip`, `Offer`, `FAQPage`) para SEO y GEO.

## Estructura prevista

```
apps/landings/
├── app/
│   ├── [slug]/page.tsx        # Landing dinámica por slug
│   ├── privacidad/page.tsx
│   └── cookies/page.tsx
├── components/                # Hero, Itinerario, Precio orientativo, FAQ, CTA WhatsApp, Formulario
├── generated/                 # instance.json resuelto (no versionado)
├── lib/
│   ├── tracking.ts            # dataLayer, UTMs, event_id
│   └── jsonld.ts              # Generadores schema.org
└── public/
```

Documentación completa: [docs/04-landings.md](../../docs/04-landings.md)
