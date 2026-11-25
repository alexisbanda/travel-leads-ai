# apps/landings

Plantilla única de landings en **Next.js (App Router) + React + TypeScript**, desplegada en **Firebase App Hosting**. Una sola plantilla genera el sitio de landings de cualquier instancia a partir de su configuración resuelta y su contenido.

## Responsabilidades

- Generar una landing por producto, público y campaña a partir del contenido de la instancia (`instances/<id>/content/landings`).
- Páginas legales (`/legal/<slug>`) a partir de `legalTexts.pages` del pack de mercado de la instancia.
- Formulario de captación (`LeadForm`, si `cta.type` es `form`) que envía a la Function `ingestLandingLead` con App Check. **Nunca escribe en Firestore directamente** ni guarda datos del viajero en `localStorage`, `sessionStorage` o cookies.
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
├── components/                # Hero, Itinerary, Includes, BestSeason, PriceGuidance, FAQ, Trust, WhatsAppCTA, LeadForm, LandingView
│   ├── landing.test.tsx       # Tests de componentes (jsdom, testing-library, axe-core)
│   └── lead-form.test.tsx     # Tests del formulario de lead
├── lib/
│   ├── config.ts              # Lee y valida generated/instance.json (loadLandingsConfig)
│   ├── content.ts             # Lee y valida instances/<id>/content/landings/*.json (loadLandings)
│   ├── params.ts              # generateStaticParams de ambas rutas (buildLandingParams, buildLegalParams)
│   ├── format.ts              # Precio (Intl), día, enlace wa.me y teléfono (libphonenumber-js)
│   ├── view.ts                # buildLandingView: secciones con datos ya resueltos, en orden
│   ├── lead-endpoint.ts       # URL de ingestLandingLead (LEAD_ENDPOINT_URL, TLA_ENV, infra.*)
│   ├── lead-form.ts           # Validación, cuerpo LandingLeadInput y envío del formulario
│   ├── attribution.ts         # UTMs, fbclid y gclid de la URL, solo en memoria
│   ├── app-check.ts           # Token de App Check (perezoso) o token del emulador
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

## Formulario de lead

`LeadForm` se renderiza en la sección `cta` cuando la landing tiene `cta: { type: "form" }`. Textos: `marketPack.landingUi.form` y `marketPack.legalTexts` (consentimiento de contacto obligatorio, de marketing opcional y aviso de privacidad). El teléfono se valida con `market.phoneDefaultRegion` y se envía en E.164. Cada envío lleva un `eventId` UUID nuevo en `attribution.eventId`. Cualquier respuesta 2xx muestra la pantalla de gracias (el endpoint responde 200); 400 con `fields` marca cada campo; 401, 429, otros errores o red caída muestran `errorGeneric` sin borrar lo escrito.

Las claves públicas de App Check salen de `channels.web` (`recaptchaSiteKey`, `firebaseApiKey`, `firebaseAppId`). En `draft` pueden estar vacías: el formulario se renderiza igual y el envío termina en error genérico.

### Variables de entorno

| Variable | Dónde se lee | Uso |
| --- | --- | --- |
| `LEAD_ENDPOINT_URL` | Servidor (build) | Override completo de la URL de `ingestLandingLead` (p. ej. el emulador). Sin ella: `https://<infra.region>-<proyecto>.cloudfunctions.net/ingestLandingLead` |
| `TLA_ENV` | Servidor (build) | `prod` usa `infra.firebaseProjects.prod`; cualquier otro valor (o ninguno), `infra.firebaseProjects.dev`. También es el `projectId` de App Check |
| `NEXT_PUBLIC_APPCHECK_EMULATOR_TOKEN` | Cliente (se incrusta en el build) | **Solo para el emulador.** Si no está vacía, se envía tal cual en `X-Firebase-AppCheck` sin inicializar Firebase. El emulador de `ingestLandingLead` la acepta si coincide con `APP_CHECK_EMULATOR_TOKEN` de `functions/.env.local` |

En producción `NEXT_PUBLIC_APPCHECK_EMULATOR_TOKEN` **no se define**. Aunque se definiera, el backend real la rechazaría con 401: fuera del emulador `ingestLandingLead` solo acepta tokens de App Check verificados.

Si falta `infra.region` o el proyecto del entorno y no hay `LEAD_ENDPOINT_URL`, la landing se publica sin formulario y el build avisa por consola (sin datos personales).

### Probar en el emulador

1. En `functions/.env.local`, define `APP_CHECK_EMULATOR_TOKEN=<token-de-prueba>`.
2. Arranca el emulador con un proyecto de demo: `firebase emulators:start --project demo-tla`.
3. Construye y sirve las landings apuntando al emulador, con el mismo token (sustituye `<región>` por la `infra.region` de la instancia):

```bash
pnpm instance:build ec-es
LEAD_ENDPOINT_URL=http://127.0.0.1:5001/demo-tla/<región>/ingestLandingLead \
NEXT_PUBLIC_APPCHECK_EMULATOR_TOKEN=<token-de-prueba> \
INSTANCE=ec-es pnpm --filter landings build
INSTANCE=ec-es pnpm --filter landings start
```

4. Abre una landing con `cta.type: "form"`, envía el formulario con datos ficticios y comprueba la pantalla de gracias y el lead en la UI del emulador de Firestore.

## Notas

- `.gitignore` de este paquete desexcluye `lib/` (`!lib/`, `!lib/**`): el `.gitignore` raíz ignora cualquier carpeta `lib/` por ser la salida de build de `functions`, pero aquí `lib/` es código fuente (ver `AGENTS.md`). `eslint.config.mjs` tiene el mismo ajuste para no ignorar `apps/landings/lib` al lintar.
- `check-hardcoding.sh` escanea `functions/src` (no `functions/`) para no tener que excluir ninguna carpeta llamada `lib` por nombre.

## Próximos pasos

- #45: componentes de la plantilla (Hero, Itinerary, PriceGuidance, Trust, FAQ...).
- #47: tracking (UTMs, Pixel, Conversions API, Consent Mode v2).
