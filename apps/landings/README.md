# apps/landings

Plantilla única de landings en **Next.js (App Router) + React + TypeScript**, desplegada en **Firebase App Hosting**. Una sola plantilla genera el sitio de landings de cualquier instancia a partir de su configuración resuelta y su contenido.

## Responsabilidades

- Generar una landing por producto, público y campaña a partir del contenido de la instancia (`instances/<id>/content/landings`).
- Páginas legales (`/legal/<slug>`) a partir de `legalTexts.pages` del pack de mercado de la instancia.
- Formulario de captación que envía a la Function `ingestLandingLead`. **Nunca escribe en Firestore directamente** (pendiente, #46).
- Tracking: GTM, Meta Pixel y eventos de servidor (Conversions API) con `event_id` compartido para deduplicar (pendiente, #47).
- Banner de consentimiento con Consent Mode v2.
- Datos estructurados schema.org (`TouristTrip`, `Offer`, `FAQPage`) para SEO y GEO.

## Estructura

```
apps/landings/
├── app/
│   ├── globals.css            # Tailwind CSS 4 y token de marca (--brand-primary)
│   ├── layout.tsx             # Layout raíz; fija --brand-primary desde brand.primaryColor
│   ├── not-found.tsx          # 404 (slugs fuera de generateStaticParams)
│   ├── [slug]/page.tsx        # Una landing publicada; dynamicParams = false
│   └── legal/[slug]/page.tsx  # Una página por entrada de legalTexts.pages
├── components/                # Hero, Itinerary, Includes, BestSeason, PriceGuidance, FAQ, Trust, WhatsAppCTA, LandingView
│   └── landing.test.tsx       # Tests de componentes (jsdom, testing-library, axe-core)
├── lib/
│   ├── config.ts              # Lee y valida generated/instance.json (loadLandingsConfig)
│   ├── content.ts             # Lee y valida instances/<id>/content/landings/*.json (loadLandings)
│   ├── params.ts              # generateStaticParams de ambas rutas (buildLandingParams, buildLegalParams)
│   ├── format.ts              # Precio (Intl), día, enlace wa.me y teléfono (libphonenumber-js)
│   ├── view.ts                # buildLandingView: secciones con datos ya resueltos, en orden
│   └── *.test.ts, test-fixtures.ts
├── postcss.config.mjs         # @tailwindcss/postcss
├── next.config.ts             # transpilePackages + alias de resolución para @tla/shared en fuente TS
├── tsconfig.json               # No extiende tsconfig.base.json (incompatible con jsx/moduleResolution de Next)
└── vitest.config.ts
```

## Configuración y contenido

- `lib/config.ts` lee `generated/instance.json` en la raíz del repositorio (lo escribe `pnpm instance:build <id>`), lo valida como `ResolvedInstanceConfig` y comprueba, fuera de `draft`, que `brand.displayName`, `brand.domain` y `channels.whatsapp.number` no estén vacíos.
- `lib/content.ts` lee `instances/<id>/content/landings/*.json`, valida cada archivo como `LandingContent` y filtra las landings `draft: true` salvo que la instancia esté en `draft`.
- Más detalle de ambos esquemas y de las rutas: [docs/04-landings.md](../../docs/04-landings.md) y [docs/11-instancias-y-configuracion.md](../../docs/11-instancias-y-configuracion.md).

## Comandos

```bash
# Resuelve la configuración de la instancia a generated/instance.json
pnpm instance:build ec-es

# Desarrollo (requiere generated/instance.json ya resuelto)
INSTANCE=ec-es pnpm --filter landings dev

# Build de producción
INSTANCE=ec-es pnpm --filter landings build
```

`INSTANCE` debe coincidir con el `id` de la instancia resuelta en `generated/instance.json`; si no coincide, `lib/config.ts` falla con un mensaje claro.

## Notas

- `.gitignore` de este paquete desexcluye `lib/` (`!lib/`, `!lib/**`): el `.gitignore` raíz ignora cualquier carpeta `lib/` por ser la salida de build de `functions`, pero aquí `lib/` es código fuente (ver `AGENTS.md`). `eslint.config.mjs` tiene el mismo ajuste para no ignorar `apps/landings/lib` al lintar.
- `check-hardcoding.sh` escanea `functions/src` (no `functions/`) para no tener que excluir ninguna carpeta llamada `lib` por nombre.

## Próximos pasos

- #45: componentes de la plantilla (Hero, Itinerary, PriceGuidance, Trust, FAQ...).
- #46: formulario de captación (`LeadForm`) y su envío a `ingestLandingLead`.
- #47: tracking (UTMs, Pixel, Conversions API, Consent Mode v2).
