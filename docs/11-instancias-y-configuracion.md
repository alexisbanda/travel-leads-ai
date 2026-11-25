# 11 · Instancias y configuración

Este repositorio es un **motor genérico**. Cada despliegue real es una **instancia**: una combinación concreta de agencia receptiva, país de destino y mercado emisor, definida por configuración y sin tocar el código del motor.

| Ejemplo de instancia | Agencia (destino) | Mercado emisor |
| --- | --- | --- |
| `ec-es` | Receptivo en Ecuador | España |
| `ec-de` | El mismo receptivo | Alemania |
| `pe-es` | Otro receptivo en Perú | España |
| `ec-us` | Receptivo en Ecuador | Estados Unidos |

## Tres capas de configuración

```mermaid
flowchart LR
  M[Pack de mercado<br/>packages/markets/es] --> R[Configuración resuelta]
  D[Pack de destino<br/>packages/destinations/ec] --> R
  I[instance.yaml<br/>instances/ec-es] --> R
  R --> B[Build: landings, functions, MCP]
  R --> S[Seed: Firestore config/*]
```

| Capa | Dónde | Qué define | Quién la cambia |
| --- | --- | --- | --- |
| **Mercado** | `packages/markets/<iso>` | Idioma y variante, moneda mostrada, zona horaria, región de teléfono, régimen legal (RGPD, cookies, transparencia IA, normativa de venta de viajes), región de datos permitida, textos legales base, tono del agente | Motor (PR revisado) |
| **Destino** | `packages/destinations/<iso>` | Taxonomía de regiones, moneda local, zona horaria de la agencia, temporadas, fuentes oficiales de requisitos de entrada y avisos de viaje **por mercado** | Motor (PR revisado) |
| **Instancia** | `instances/<id>/instance.yaml` | Agencia, socio, marca, proyectos de Firebase, canales (CRM, BSP, Meta, GTM), segmentos, rangos de presupuesto, SLA, retención, comisiones, agentes activos | Operación de la instancia |

Orden de resolución: **mercado → destino → instancia**. La instancia puede sobrescribir valores por defecto de los packs, salvo los marcados como **bloqueados** por el pack de mercado (por ejemplo, la región de datos permitida o la obligación de avisar de que el agente es una IA).

## Convención de identificadores

```
<destino>-<mercado>[-<sufijo>]
```

- Códigos ISO 3166-1 alfa-2 en minúsculas: `ec-es`, `pe-de`, `ec-us`.
- Sufijo solo si hay dos instancias con el mismo par (dos agencias en el mismo destino): `ec-es-andes`.
- El identificador se usa en proyectos de Firebase, alias de despliegue, tags de versión y carpetas.

## Aislamiento: una instancia, sus propios proyectos

Cada instancia tiene **sus propios proyectos de Firebase** (`dev` y `prod`). No se comparten bases de datos entre instancias.

- Los datos personales de cada mercado quedan en la región que exige su pack (UE para mercados europeos).
- Facturación, accesos y borrado independientes. Cerrar una instancia es borrar sus proyectos.
- Un fallo o un error de configuración en una instancia no afecta a las demás.

Ver [ADR 0006](adr/0006-motor-generico-instancias.md) para las alternativas descartadas (multi-tenant en un solo despliegue).

## Estructura

```
instances/
├── _template/
│   └── instance.yaml          # Plantilla comentada para nuevas instancias
└── ec-es/
    ├── instance.yaml          # Configuración de la instancia
    ├── README.md              # Contexto de negocio de esta instancia
    ├── content/
    │   └── landings/*.json    # Contenido de landings (idioma del mercado)
    ├── prompts/               # Ajustes del agente propios de la agencia (opcional)
    └── evals/                 # Casos de evaluación propios (opcional)

packages/
├── markets/<iso>/             # Pack de mercado
└── destinations/<iso>/        # Pack de destino
```

## Ejemplo resumido de `instance.yaml`

```yaml
id: ec-es
name: "Ecuador desde España"
status: draft                  # draft | pilot | active | paused
agency:
  slug: agencia-ec
  legalName: ""                # obligatorio fuera de draft
  country: EC
  timezone: America/Guayaquil  # opcional; vacío u omitido = la del pack de destino
  notify: { channel: email, target: secret:AGENCY_NOTIFY_TARGET }
partner: { legalName: "", country: ES }
destination: { country: EC }
market: { country: ES }        # locale, moneda y zona horaria vienen del pack
infra:
  firebaseProjects: { dev: tla-ec-es-dev, prod: tla-ec-es-prod }
  region: europe-southwest1    # validado contra las regiones permitidas por el pack ES
  bigqueryLocation: EU
channels:
  crm: { provider: hubspot, tokenSecret: secret:CRM_API_TOKEN }
  whatsapp: { bsp: respond_io, number: "", webhookSecret: secret:WHATSAPP_BSP_WEBHOOK_SECRET }
  email: { from: "", smtpSecret: secret:SMTP_CONNECTION_URI }
  web: { recaptchaSiteKey: "", firebaseApiKey: "", firebaseAppId: "" }   # obligatorias fuera de draft
segments:
  - { id: adventure, label: "Aventura y naturaleza" }
  - { id: couple, label: "Parejas y luna de miel" }
sla: { warnAfterMinutes: 10, breachAfterMinutes: 30 }
commission: { model: fee_plus_commission, rate: 0 }   # fracción 0–1; > 0 fuera de draft
```

La plantilla completa y comentada está en [`instances/_template/instance.yaml`](../instances/_template/instance.yaml).

## Esquemas de configuración

Los tres esquemas Zod viven en `packages/shared/src/instance/` y se exportan desde `@tla/shared`: `InstanceConfig`, `MarketPack` y `DestinationPack` (cada uno con su tipo TypeScript del mismo nombre). Validan **estructura y formato** de cada capa por separado; las reglas que cruzan capas (región frente a mercado, existencia de packs, `scc` según adecuación, claves bloqueadas) las aplica `validateInstanceRules` (ver [Validación](#validación)).

### Reglas comunes

- **Objetos cerrados.** Una clave desconocida (por ejemplo, una errata) es un error.
- **Formatos sin listas de países.** País: ISO 3166-1 alfa-2 por formato (dos letras mayúsculas, sin lista cerrada, así que `XX`/`YY` de la plantilla son válidos). Moneda: ISO 4217, idioma: BCP 47 y zona horaria: IANA, comprobados con la API `Intl` del entorno de ejecución. Cada error indica el campo (`market.country`) y el estándar incumplido.
- **Secretos.** `agency.notify.target`, `partner.notify.target`, `channels.email.smtpSecret`, `channels.crm.tokenSecret`, `channels.whatsapp.webhookSecret`, `channels.meta.capiTokenSecret` y `channels.meta.pageTokenSecret` deben ser `secret:NOMBRE` (mayúsculas, dígitos y `_`). Un valor en claro se rechaza.
- **Campos pendientes.** Los campos de texto que la plantilla deja en `""` admiten la cadena vacía en cualquier `status`; si traen valor, se valida su formato. Excepción: fuera de `draft` (es decir, en `pilot`, `active` y `paused`) son obligatorios `agency.legalName`, `partner.legalName`, `channels.whatsapp.number` (E.164), `channels.email.from` (si existe `channels.email`), `channels.web.recaptchaSiteKey`, `channels.web.firebaseApiKey`, `channels.web.firebaseAppId` y `commission.rate > 0`, con un error por cada campo que falte en su ruta (p. ej. `channels.web.recaptchaSiteKey: obligatorio cuando status no es draft`).

### `InstanceConfig` (`instances/<id>/instance.yaml`)

| Campo | Tipo y validación | Vacío admitido |
| --- | --- | --- |
| `id` | `<destino>-<mercado>[-<sufijo>]`: `^[a-z]{2}-[a-z]{2}(-[a-z0-9]+)?$` | No |
| `name` | Texto | No |
| `status` | `draft` · `pilot` · `active` · `paused` | No |
| `agency.slug` | Identificador: minúsculas, dígitos, `-` y `_` | No |
| `agency.legalName` | Texto | Solo en `draft` |
| `agency.country` | ISO 3166-1 alfa-2 | No |
| `agency.timezone` | IANA. Opcional; vacío u omitido = la del pack de destino | Sí |
| `agency.website` | URL `https://` | Sí |
| `agency.notify` | Opcional. Si se omite, la tarea `agency.notify` se registra como `skipped` con un aviso en logs ([spec 003](specs/003-on-lead-created.md)) | — |
| `agency.notify.channel` | `whatsapp_group` · `email` · `slack` | No |
| `agency.notify.target` | `secret:NOMBRE`. Con `email`, el secreto contiene las direcciones de los destinatarios separadas por comas o saltos de línea; si no queda ninguna, el aviso se registra como `skipped` (`no_recipients`) con un aviso en logs sin direcciones | No |
| `agency.locale` | BCP 47. Opcional: idioma de los avisos internos (email de lead nuevo). Si se omite, se usa el locale del mercado resuelto. Los textos existen en `es` y `en` (por idioma base); otro idioma cae en `en` | — |
| `partner.legalName` | Texto | Solo en `draft` |
| `partner.country` | ISO 3166-1 alfa-2 | No |
| `partner.notify` | Opcional, mismo formato que `agency.notify` (`{ channel, target: secret:NOMBRE }`). Aviso al socio de los leads sin respuesta (SLA, #18); sin él, ese aviso se omite con un aviso en logs. El aviso de lead nuevo va solo a la agencia | — |
| `destination.country` | ISO 3166-1 alfa-2 | No |
| `market.country` | ISO 3166-1 alfa-2 | No |
| `market.locale` | BCP 47. Opcional (por defecto, el del pack) | — |
| `market.currency` | ISO 4217. Opcional | — |
| `market.timezone` | IANA. Opcional | — |
| `market.phoneDefaultRegion` | ISO 3166-1 alfa-2. Opcional | — |
| `market.businessHours` | Opcional. `start` y `end` en `HH:MM` (24 h, `end` > `start`); `days`: lista no vacía y sin repetidos de 1 (lunes) … 7 (domingo) | — |
| `brand.displayName` | Texto | Sí |
| `brand.domain` | Nombre de dominio, sin esquema ni ruta | Sí |
| `brand.logo` | Ruta en Cloud Storage o en `content/` | Sí |
| `brand.primaryColor` | `#RRGGBB` | No |
| `infra.firebaseProjects.dev` / `.prod` | ID de proyecto (6–30 caracteres: minúsculas, dígitos y `-`) | No |
| `infra.region` | Región de Google Cloud (formato `<área>-<zona><n>`) | Sí |
| `infra.bigqueryLocation` | Multirregión en mayúsculas o región de Google Cloud | Sí |
| `channels.crm.provider` | `hubspot` · `pipedrive` · `memory`. `memory` es un adaptador en memoria solo para desarrollo, hasta el ADR de CRM; `hubspot` y `pipedrive` aún no tienen adaptador y la tarea `crm.upsert` se registra como `skipped` ([spec 003](specs/003-on-lead-created.md)) | No |
| `channels.crm.tokenSecret` | `secret:NOMBRE` | No |
| `channels.whatsapp.bsp` | `respond_io` · `360dialog` · `other` | No |
| `channels.whatsapp.number` | E.164 (`+` y 7–15 dígitos) | Solo en `draft` |
| `channels.whatsapp.webhookSecret` | `secret:NOMBRE` | No |
| `channels.email` | Opcional. Obligatorio si `agency.notify.channel` o `partner.notify.channel` es `email`. Envío con la extensión Trigger Email (ver [Email: extensión Trigger Email](#email-extensión-trigger-email)) | — |
| `channels.email.from` | Remitente (`dirección` o `Nombre <dirección>`) del dominio de la instancia. Si no está vacío, se escribe como `from` en cada documento de `mail`; vacío: el remitente por defecto de la extensión | Solo en `draft` |
| `channels.email.smtpSecret` | `secret:NOMBRE`: credencial SMTP (URI de conexión) que usa la extensión. El código del motor no la lee | No |
| `channels.meta.pixelId` / `.pageId` | Dígitos | Sí |
| `channels.meta.adAccountId` | Dígitos, con prefijo `act_` opcional | Sí |
| `channels.meta.capiTokenSecret` | `secret:NOMBRE`: token de la Conversions API con el que `metaCapiLeadTask` envía el evento `Lead` (ver [Meta Conversions API](#meta-conversions-api)). Solo se ata a la función si `pixelId` no está vacío | No |
| `channels.meta.pageTokenSecret` | `secret:NOMBRE`: token de página con el que `processMetaInbox` lee los leads de la Graph API ([spec 004](specs/004-meta-lead-ads-ingesta.md)) | No |
| `channels.meta.leadForm.fieldMap` | Opcional (por defecto `{}`). Clave de la pregunta personalizada del formulario de Lead Ads → campo destino (`travelMonth` · `paxAdults` · `paxChildren` · `budgetRange` · `segment` · `notes` · `marketingConsent`) o `{ field, values }` para opción múltiple (respuesta → valor). Se rechazan destinos desconocidos y valores de `values` que no validen contra su destino (p. ej. `travelMonth` en `AAAA-MM`) | Sí |
| `channels.web` | Obligatorio en el YAML (sin valor por defecto, como `channels.whatsapp`). Claves de la app web de Firebase que usa el formulario de lead de las landings con App Check (ver [Formulario web: App Check](#formulario-web-app-check)). Objeto estricto | — |
| `channels.web.recaptchaSiteKey` | Clave del sitio de reCAPTCHA Enterprise que usa App Check (letras, dígitos, `-` y `_`; 20 caracteres o más) | Solo en `draft` |
| `channels.web.firebaseApiKey` | `apiKey` de la app web de Firebase (`AIza…`) | Solo en `draft` |
| `channels.web.firebaseAppId` | `appId` de la app web de Firebase (`1:<número>:web:<hex>`) | Solo en `draft` |
| `channels.gtmId` | `GTM-…` | Sí |
| `channels.ga4MeasurementId` | `G-…` | Sí |
| `segments[]` | Lista no vacía de objetos `{ id, label }`; `id` es un identificador único en la lista; `label` en el idioma del mercado | `label`: sí |
| `pricing.budgetRanges[]` | Lista de rangos por persona: `<N`, `N-M` o `>N` (puede estar vacía) | — |
| `sla.warnAfterMinutes` / `.breachAfterMinutes` | Enteros positivos; `breachAfterMinutes` > `warnAfterMinutes` | No |
| `compliance.dataRetentionMonths` | Entero positivo | No |
| `compliance.legalTextsVersion` | Texto | Sí |
| `compliance.internationalTransfer` | `scc` · `adequacy` · `none` | No |
| `commission.model` | `fee` · `commission` · `fee_plus_commission` | No |
| `commission.rate` | Fracción entre 0 y 1 (`0.1` = 10 %) | `0` solo en `draft` |
| `agents.qualification.enabled` | Booleano | No |
| `agents.qualification.mode` | `assisted` · `autonomous` (este último requiere ADR) | No |
| `agents.proposal.enabled` | Booleano | No |
| `agents.persona.name` | Texto | Sí |
| `features.mcpCatalog` | Booleano | No |

### `MarketPack` (`packages/markets/<iso>`)

| Campo | Tipo y validación |
| --- | --- |
| `country` | ISO 3166-1 alfa-2 del mercado emisor |
| `locale` | BCP 47: idioma y variante de los textos para viajeros |
| `currency` | ISO 4217: moneda en la que se muestran los precios orientativos |
| `timezone` | IANA: zona horaria del mercado |
| `phoneDefaultRegion` | ISO 3166-1 alfa-2: región para interpretar teléfonos sin prefijo |
| `businessHours` | Horario de atención por defecto (mismo formato que `market.businessHours`) |
| `legalRegime` | Régimen de protección de datos: `gdpr` · `ccpa` · `lgpd` · `other` |
| `dataRegions` | Lista no vacía y sin repetidos de regiones de Google Cloud permitidas para los datos |
| `bigqueryLocation` | Ubicación de BigQuery exigida (multirregión o región) |
| `dataRetentionMonths` | Entero positivo: conservación por defecto de leads sin venta |
| `internationalTransferWithoutAdequacy` | `scc` · `adequacy` · `none`: mecanismo exigido si el destino no tiene decisión de adecuación para este mercado |
| `aiDisclosure` | `{ text, version }`: aviso de que el viajero habla con una IA, en el idioma del mercado |
| `legalTexts` | `{ version, privacyNotice, commercialConsent, marketingConsent?, cookieBanner?, pages }`: textos legales base con una versión común |
| `legalTexts.pages` | `[{ slug, title, body }]`: páginas legales completas que publica la plantilla de landings en `/legal/<slug>`. Al menos una, con slugs en kebab-case y sin repetidos |
| `priceDisclaimer` | Texto: aviso de precios orientativos |
| `agentTone` | Texto: tono del agente para los prompts |
| `landingUi` | Textos de interfaz de la plantilla de landings, en el idioma del mercado (ver abajo). Obligatorio; no es una clave bloqueable |
| `locked` | Lista sin repetidos de claves de este pack que la instancia no puede sobrescribir: `locale`, `currency`, `timezone`, `phoneDefaultRegion`, `businessHours`, `legalRegime`, `dataRegions`, `bigqueryLocation`, `dataRetentionMonths`, `internationalTransferWithoutAdequacy`, `aiDisclosure`, `legalTexts`, `priceDisclaimer`, `agentTone` |

Las versiones (`aiDisclosure.version`, `legalTexts.version`) son `draft` o un identificador como `1.0.0` o `2026-01`. Los textos no pueden estar vacíos.

`landingUi` agrupa los textos fijos de la interfaz de las landings, para que los componentes no escriban textos para viajeros. Es un objeto estricto y todos sus textos son no vacíos:

| Campo | Uso |
| --- | --- |
| `aiImageLabel` | Etiqueta visible junto a un medio con `aiGenerated: true` |
| `priceFrom` | Plantilla del precio orientativo; debe contener `{price}`, que se sustituye por el precio ya formateado (p. ej. «Desde {price} por persona») |
| `sectionTitles` | `{ itinerary, includes, bestSeason, priceGuidance, faq, trust }`: títulos de las secciones |
| `dayLabel` | Plantilla de la etiqueta de cada día del itinerario; debe contener `{day}` (p. ej. «Día {day}») |
| `includedLabel`, `notIncludedLabel` | Encabezados de las listas de lo que incluye y no incluye el viaje |
| `trust` | `{ phoneLabel, agencyLabel }`: etiquetas del bloque de confianza |
| `whatsappCta` | Texto del botón de WhatsApp |
| `form` | Textos del formulario de lead (ver abajo) |

`landingUi.form` es un objeto estricto con estos textos, todos no vacíos. No incluye los textos de consentimiento ni el aviso de privacidad: el formulario los toma de `legalTexts` (`commercialConsent`, `marketingConsent`, `privacyNotice`, `version`). Ningún texto puede prometer precio, disponibilidad ni reserva.

| Campo | Uso |
| --- | --- |
| `nameLabel`, `phoneLabel`, `emailLabel`, `travelMonthLabel`, `adultsLabel`, `childrenLabel` | Etiquetas de los campos |
| `submit`, `submitting` | Botón de envío y su texto mientras se envía |
| `errorRequired`, `errorPhone`, `errorEmail`, `errorConsent` | Errores de campo: obligatorio vacío, teléfono inválido, email inválido y consentimiento obligatorio sin aceptar |
| `errorGeneric` | Error general (rechazo de App Check, límite de peticiones o fallo de red). No revela la causa |
| `thanksTitle`, `thanksBody` | Título y cuerpo de la pantalla de gracias |
| `thanksWhatsapp` | Texto del botón a WhatsApp de la pantalla de gracias |

En la configuración resuelta queda en `marketPack.landingUi` de `generated/instance.json`.

Los packs viven en el paquete `@tla/markets` (`packages/markets/<iso>/pack.ts`) y se registran por código de país en `marketPacks`; `getMarketPack(country)` devuelve `undefined` si no existe. `aiDisclosure.text` admite el marcador `{brand}`, que se sustituye por `brand.displayName` de la instancia.

## Qué lee la plantilla de landings

`apps/landings` (ver [04-landings.md](04-landings.md)) no lee `instance.yaml` ni los packs directamente: lee `generated/instance.json` en la raíz del repositorio, que escribe `pnpm instance:build <id>` como `ResolvedInstanceConfig`. De ahí toma la marca, el número de WhatsApp, la moneda y el locale del mercado, las páginas de `marketPack.legalTexts.pages` para las rutas `/legal/<slug>` y los textos de interfaz de `marketPack.landingUi`.

Fuera de `draft`, el build de la plantilla exige que `brand.displayName`, `brand.domain` y `channels.whatsapp.number` no estén vacíos; si falta alguno, falla con un error que los lista. En `draft`, solo avisa por consola y sigue adelante.

#### Claves bloqueadas

`findLockedOverrides(market, instance)` (`@tla/shared`) es una función pura que lista los campos de la instancia que sobrescriben una clave de `market.locked`, como `{ key, path, expected, actual, message }`. Solo comprueba las claves bloqueadas por el pack, y un valor vacío (`""`, instancia en `draft`) u omitido no cuenta como sobrescritura.

| Clave bloqueada | Campo de la instancia | Regla |
| --- | --- | --- |
| `dataRegions` | `infra.region` | Debe estar en la lista |
| `bigqueryLocation` | `infra.bigqueryLocation` | Debe ser igual |
| `locale`, `currency`, `timezone`, `phoneDefaultRegion`, `businessHours` | `market.<clave>` | Si se indica, debe ser igual (los días de `businessHours` se comparan sin orden) |
| `dataRetentionMonths` | `compliance.dataRetentionMonths` | Debe ser igual |
| `legalRegime`, `internationalTransferWithoutAdequacy`, `aiDisclosure`, `legalTexts`, `priceDisclaimer`, `agentTone` | — | Sin campo en `InstanceConfig`, que es estricto: la instancia no puede sobrescribirlas |

`compliance.internationalTransfer` no se compara con `internationalTransferWithoutAdequacy`: depende de la decisión de adecuación del destino y es una regla cruzada aparte.

### `DestinationPack` (`packages/destinations/<iso>`)

| Campo | Tipo y validación |
| --- | --- |
| `country` | ISO 3166-1 alfa-2 del destino |
| `currency` | ISO 4217: moneda local |
| `timezone` | IANA: zona horaria por defecto de la agencia |
| `regions[]` | Lista no vacía de `{ id, label }` con `id` único: taxonomía de regiones con la que se clasifican los tours |
| `seasons[]` | Lista de `{ id, label, months, regions? }`: `id` único, `months` de 1 a 12 sin repetidos, `regions` (opcional) con ids de `regions[]`; si se omite, la temporada aplica a todo el destino |
| `markets` | Objeto con al menos un mercado; la clave es el código ISO 3166-1 alfa-2 del mercado emisor (mayúsculas, como `market.country`) |
| `markets.<PAÍS>.entryRequirements[]` | Lista no vacía de fuentes oficiales `{ label, url }` (URL `https://`) de requisitos de entrada |
| `markets.<PAÍS>.travelAdvice[]` | Lista no vacía de fuentes oficiales `{ label, url }` de avisos de viaje del mercado sobre el destino |
| `markets.<PAÍS>.adequacyDecision` | Booleano: si el destino tiene decisión de adecuación de protección de datos para ese mercado (determina si aplica `internationalTransferWithoutAdequacy`) |

## Validación

`pnpm instance:validate [id]` (paquete `packages/instance-cli`) valida una instancia o, sin argumentos, todas las carpetas de `instances/` que tengan `instance.yaml`. Con `--dir <carpeta>` valida una carpeta de instancia fuera de `instances/` (las rutas relativas se resuelven desde la raíz del repositorio; mejor usar rutas absolutas).

Para cada instancia comprueba, en este orden:

1. **YAML** (`[yaml]`): el archivo se puede parsear.
2. **Esquema** (`[schema]`): `InstanceConfig` (ver [Esquemas de configuración](#esquemas-de-configuración)): estructura y tipos (ISO de país, ISO 4217 de moneda, BCP 47 de idioma, zonas horarias IANA), campos obligatorios fuera de `draft` y secretos solo como referencias `secret:NOMBRE`.
3. **Carpeta** (`[instance-id]`): `id` coincide con el nombre de la carpeta.
4. **Reglas cruzadas** con los packs del registro (`@tla/markets`, `@tla/destinations`), con `validateInstanceRules` de `@tla/shared`:

| Regla | Campo | Falla si |
| --- | --- | --- |
| `pack-missing` | `market.country` / `destination.country` | No existe el pack referenciado. Las reglas que necesitan ese pack no se evalúan. |
| `destination-market-missing` | `market.country` | El pack de destino no tiene entrada `markets.<PAÍS>` para el mercado de la instancia. |
| `data-region` | `infra.region`, `infra.bigqueryLocation` | La región no está en `dataRegions` del pack de mercado, o la ubicación de BigQuery no es igual a su `bigqueryLocation`. Se aplica con cualquier régimen y el mensaje nombra el mercado y su régimen. Vacías se admiten solo en `draft`. |
| `locked-override` | Según [Claves bloqueadas](#claves-bloqueadas) | La instancia sobrescribe una clave de `locked` (`findLockedOverrides`), salvo `dataRegions` y `bigqueryLocation`. |
| `international-transfer` | `compliance.internationalTransfer` | El destino no tiene decisión de adecuación para el mercado (`adequacyDecision: false`) y el valor no es igual a `internationalTransferWithoutAdequacy` del pack de mercado. |
| `ai-disclosure` | `agents.<agente>.enabled` | Hay un agente activo (`qualification` o `proposal`) y el pack de mercado no trae `aiDisclosure.text`. |
| `legal-texts-draft` | `status` | La instancia no está en `draft` y `legalTexts.version` del pack de mercado es `draft`, o hay un agente activo y `aiDisclosure.version` es `draft`. |

**Precedencia entre `data-region` y `locked-override`.** `infra.region` e `infra.bigqueryLocation` se comprueban siempre con `data-region`, estén o no bloqueadas `dataRegions` y `bigqueryLocation` en el pack; `locked-override` excluye esas dos claves. Así cada campo da un solo error.

**Plantillas.** Las carpetas que empiezan por `_` (p. ej. `_template`) se validan solo contra `InstanceConfig`, sin packs, reglas cruzadas ni comprobación de carpeta, y se informan como `_template: OK (solo esquema)`.

Salida y código de retorno:

```text
_template: OK (solo esquema)
ec-es: 1 error
  [data-region] infra.region: el mercado ES (gdpr) solo permite estas regiones de datos: … (la instancia trae us-central1)
```

Sale con 0 si todas las instancias son válidas y con 1 si alguna falla, si el id no existe o si los argumentos no son válidos.

CI valida **todas** las instancias en cada PR (paso `Validate instances` de `.github/workflows/ci.yml`).

## Cómo llega la configuración al código

| Momento | Mecanismo |
| --- | --- |
| Build | `pnpm instance:build <id>` resuelve las tres capas y genera `generated/instance.json` para landings, functions y MCP. El código lee siempre de ahí, nunca de constantes. |
| Runtime | Valores operativos (umbrales de SLA, horario, agentes, flags) se siembran en Firestore `config/*` con `pnpm instance:seed <id> local\|dev` y se pueden ajustar sin redesplegar. |
| Secretos | Secret Manager del proyecto de la instancia. El YAML solo los nombra. |

### Email: extensión Trigger Email

Los avisos por email (`agency.notify.channel: email` o `partner.notify.channel: email`) no envían SMTP desde el motor: la tarea `agencyNotifyTask` y `slaWatchdog` escriben un documento en la colección `mail` ([doc 02](02-modelo-de-datos.md#mailmailid)) y la extensión **Trigger Email** de Firebase lo envía. Los destinatarios salen del secreto de `agency.notify.target` (o de `partner.notify.target`), que se ata a la función al desplegar.

La instalación la hace el equipo, una vez por proyecto (`dev` y `prod`) de la instancia; los agentes no despliegan:

1. Crear en Secret Manager del proyecto de la instancia el secreto con el nombre de `channels.email.smtpSecret` (URI SMTP del dominio de la instancia, p. ej. `smtps://usuario:contraseña@servidor:465`) y los de `agency.notify.target` y, si existe, `partner.notify.target` (direcciones de los destinatarios).
2. Instalar la extensión (`firebase/firestore-send-email`) con:
   - **Ubicación de Cloud Functions**: la región de datos de la instancia (`infra.region`, que sale del pack de mercado). Nunca otra.
   - **Colección de email**: `mail`.
   - **URI de conexión SMTP**: el secreto de `channels.email.smtpSecret` (la extensión lo guarda en Secret Manager; no se escribe en claro en ningún archivo del repositorio).
   - **Remitente por defecto**: el de `channels.email.from`.
3. Activar la política TTL de Firestore sobre el campo `expireAt` de la colección `mail` (los documentos se conservan 7 días).

### Meta Conversions API

La tarea `metaCapiLeadTask` (`meta.capi.lead`, [spec 003](specs/003-on-lead-created.md#metacapilead)) envía el evento `Lead` al píxel de `channels.meta.pixelId` con el mismo `event_id` que el Pixel de la landing. Solo se encola si `pixelId` no está vacío; en ese caso la función ata el secreto de `channels.meta.capiTokenSecret`, que el equipo crea en Secret Manager del proyecto de la instancia.

- **Consentimiento.** El email y el teléfono (`em`, `ph`, normalizados y en SHA-256) solo se envían si el lead tiene el consentimiento de `marketing` concedido y no retirado. Sin él, el evento va solo con `fbc`/`fbp` si existen, o con `user_data` vacío. Nunca se envían IP, _user agent_ ni nombre.
- **`META_CAPI_TEST_EVENT_CODE`.** Parámetro de Cloud Functions (`defineString`, vacío por defecto) con el código de prueba del Administrador de eventos de Meta. **Solo en dev**, para validar el evento con un Pixel de pruebas; **nunca se define en prod**. Vacío: no se envía `test_event_code`.

### Formulario web: App Check

El formulario de lead de las landings envía con Firebase App Check y reCAPTCHA Enterprise. Para ello la plantilla necesita tres claves de `channels.web`. Son **públicas** (acaban en el JavaScript del navegador y no son secretos, así que van en claro en `instance.yaml`, no en Secret Manager), pero **cambian por instancia**, porque cada instancia tiene sus propios proyectos de Firebase. Pueden quedar vacías en `draft`; fuera de `draft` son obligatorias.

- `firebaseApiKey` y `firebaseAppId`: consola de Firebase del proyecto de la instancia → **Configuración del proyecto** → **General** → **Tus apps** → app web (si no existe, se registra una) → objeto `firebaseConfig` (`apiKey` y `appId`).
- `recaptchaSiteKey`: consola de Google Cloud del mismo proyecto → **Security** → **reCAPTCHA** → crear una clave de tipo sitio web con los dominios de las landings de la instancia. Después, en la consola de Firebase → **App Check** → app web → proveedor **reCAPTCHA Enterprise**, se registra esa misma clave.

### Configuración resuelta (`generated/instance.json`)

`pnpm instance:build <id> [--out <ruta>]` carga `instances/<id>/instance.yaml`, aplica las reglas de [Validación](#validación) y, si no hay ningún error, resuelve la instancia con `resolveInstance` (`packages/shared`):

1. Los campos opcionales de `market` (`locale`, `currency`, `timezone`, `phoneDefaultRegion`, `businessHours`) toman el valor de la instancia si lo trae y, si no, el del pack de mercado. Un override de una clave bloqueada hace fallar el build (`locked-override`).
2. `agency.timezone` vacía u omitida toma la zona horaria del pack de destino.
3. `infra.region` e `infra.bigqueryLocation` son obligatorias para resolver, también en `draft` (`data-region`).
4. El marcador `{brand}` se sustituye en todos los textos del pack de mercado (aviso de IA incluido) por `brand.displayName` o, mientras esté vacío, por `name`.
5. Se añaden `marketPack` (completo, ya con la marca) y `destinationPack` con `markets` reducido a la entrada del mercado de la instancia.

El resultado cumple el esquema `ResolvedInstanceConfig`: la forma de `InstanceConfig` con esos campos ya obligatorios, más `marketPack: MarketPack` y `destinationPack: DestinationPack`. Se escribe con claves ordenadas, 2 espacios y sin marcas de tiempo, de modo que dos builds de la misma entrada son idénticos byte a byte. Si algo falla, sale con 1, lista los errores como `instance:validate` y no escribe nada.

El código lo lee con `readResolvedInstance(path)`; functions usa `TLA_INSTANCE_CONFIG` o, por defecto, `generated/instance.json` de la raíz, y toma de ahí la región (`setGlobalOptions`). `generated/` no se versiona.

### Configuración operativa (`config/*`)

`pnpm instance:seed <id> <env>` resuelve la instancia en memoria y escribe `config/sla`, `config/agents` y `config/flags` (campos en [doc 02](02-modelo-de-datos.md#configdocid)). `env` es `local` (emulador, `FIRESTORE_EMULATOR_HOST` o `127.0.0.1:8080`) o `dev` (proyecto `infra.firebaseProjects.dev` con ADC; se niega si `FIRESTORE_EMULATOR_HOST` está definida). `prod` está prohibido: sale con 1 antes de crear ningún cliente, y el comando también se niega si el proyecto final coincide con `infra.firebaseProjects.prod`. La escritura es `set` con `merge`: idempotente y conserva los campos añadidos a mano. CI ejecuta los tests de integración contra el emulador (`pnpm test:emulator`).

## Despliegue

```bash
pnpm instance:validate ec-es
pnpm deploy:instance ec-es dev     # usa el alias de Firebase ec-es-dev
pnpm deploy:instance ec-es prod    # requiere tag y aprobación en CI
```

Versionado por instancia con tags `ec-es@v0.3.0`. Una mejora del motor se despliega a cada instancia cuando su responsable lo decide.

## Regla de oro: nada de valores de instancia en el motor

En `apps/`, `functions/` y `packages/shared` no puede aparecer ningún valor propio de un país, mercado o agencia: nombres de países, monedas, prefijos telefónicos, regiones de GCP, textos legales, números de WhatsApp. Todo sale de la configuración resuelta.

`scripts/check-hardcoding.sh` (CI) busca estos patrones fuera de `packages/markets`, `packages/destinations` e `instances/`.

## Crear una instancia nueva

1. `cp -r instances/_template instances/<id>` y rellenar `instance.yaml`.
2. Si el mercado o el destino no tienen pack, crearlo primero (PR al motor, con revisión legal para mercados nuevos).
3. Crear los proyectos de Firebase en la región que indique el pack de mercado.
4. `pnpm instance:validate <id>`, `pnpm instance:build <id>` y `pnpm instance:seed <id> dev`.
5. Cargar el catálogo de la agencia (doc 05) y el contenido de las landings.
6. Ejecutar la prueba de punta a punta ([spec 002](specs/002-prueba-punta-a-punta.md)).

## Qué cambia entre mercados (y por qué hay packs)

Un mercado nuevo no es solo traducir. Antes de activar uno, su pack debe resolver al menos:

| Aspecto | Ejemplo España / UE | Ejemplo otros mercados (a investigar con asesoría local) |
| --- | --- | --- |
| Protección de datos | RGPD, cláusulas contractuales tipo si el destino no tiene adecuación | Leyes estatales de privacidad, normas de consentimiento para mensajería comercial |
| Venta de viajes | Vender viajes combinados exige ser agencia con garantías | Algunos estados de EE. UU. exigen registro como *seller of travel* |
| Transparencia IA | AI Act: avisar de que se habla con una IA | Según jurisdicción |
| Región de datos | Europa | La que exija o recomiende la normativa |
| Idioma y tono | es-ES, cercano | en-US, de-DE… con su propio tono |
| Avisos de viaje oficiales | Ministerio de Asuntos Exteriores | El organismo equivalente del país emisor |
