# 03 · Registro de leads

El registro de leads es la pieza central: recibe leads de cualquier origen, los normaliza, evita duplicados, guarda la atribución y el consentimiento, y orquesta todo lo que pasa después.

## Puntos de entrada

| Función | Origen | Autenticación |
| --- | --- | --- |
| `ingestLandingLead` | Formulario de landings | App Check (reCAPTCHA Enterprise) + validación Zod |
| `metaLeadWebhook` | Meta Lead Ads | `GET` verificación con `META_VERIFY_TOKEN`; `POST` firma `X-Hub-Signature-256` con `META_APP_SECRET` |
| `whatsappWebhook` | Proveedor BSP | Firma o secreto compartido del BSP |
| `crmWebhook` | CRM | Secreto del CRM |

## Patrón de webhook: responder rápido, procesar después

Meta y los BSP reintentan si no reciben `200` a tiempo. Por eso:

1. Verificar firma → si falla, `401`.
2. Guardar el payload crudo en `inbox/{deliveryId}` (TTL de 7 días) y responder `200`.
3. Un trigger `onDocumentCreated(inbox/{id})` procesa el payload de forma idempotente.

```ts
// Pseudocódigo: functions/src/http/metaLeadWebhook.ts
export const metaLeadWebhook = onRequest(
  { secrets: [META_APP_SECRET, META_VERIFY_TOKEN] }, // región: setGlobalOptions desde la configuración de la instancia
  async (req, res) => {
    if (req.method === "GET") return verifySubscription(req, res);
    if (!isValidSignature(req.rawBody, req.get("x-hub-signature-256"))) {
      return res.sendStatus(401);
    }
    const deliveryId = deliveryIdFrom(req.body); // leadgen_id
    await db.doc(`inbox/meta_${deliveryId}`).create({ payload: req.body, receivedAt: now() })
      .catch(ignoreAlreadyExists);
    res.sendStatus(200);
  },
);
```

## Idempotencia y deduplicación

- **Idempotencia de entrega:** el ID del documento en `inbox` es el ID de la entrega (`leadgen_id`, `message.id`). `create()` falla si ya existe → se ignora.
- **Deduplicación de personas:** `dedupeKey = sha256(phoneE164 ?? email)`. Si existe un lead abierto (no `won`, `lost` ni `invalid`) con el mismo `dedupeKey` en los últimos 90 días, se **añade un evento** `reengaged` al lead existente en lugar de crear uno nuevo. La atribución original se conserva; la nueva se guarda en el evento.
- La comprobación y la creación van en una **transacción** de Firestore sobre un documento índice `dedupe/{dedupeKey}`.

## Normalización

| Campo | Regla |
| --- | --- |
| Teléfono | `libphonenumber-js`, país por defecto `market.phoneDefaultRegion`, salida E.164 |
| Email | `trim().toLowerCase()` |
| Nombre | `trim()`, colapsar espacios, no inventar apellidos |
| Texto libre | Recortar a 1 000 caracteres; nunca enviarlo a un LLM sin pasar por el filtro de PII (doc 06) |

## `onLeadCreated`: orquestación

Para cada lead nuevo (y en transiciones relevantes), se encolan tareas independientes con **Cloud Tasks**, de modo que el fallo de una no bloquea las otras y cada una tiene sus propios reintentos:

| Tarea | Acción |
| --- | --- |
| `crm.upsert` | Crea o actualiza contacto y deal en el CRM; guarda IDs |
| `agency.notify` | Mensaje al grupo o canal de la agencia con resumen y enlace al CRM |
| `meta.capi.lead` | Evento `Lead` a Conversions API con el mismo `eventId` del Pixel |
| `agent.qualify` | Arranca el agente de calificación si el origen es WhatsApp |

## SLA de primera respuesta

`slaWatchdog` se ejecuta cada 5 minutos:

| Condición | Acción |
| --- | --- |
| Lead `new` sin `firstResponseAt` tras `sla.warnAfterMinutes` dentro de `market.businessHours` | Aviso al socio en el mercado |
| Tras `sla.breachAfterMinutes` | Aviso a la agencia + marca `sla.breachedAt` |
| Fuera de horario | El agente envía un mensaje de acuse (si hay consentimiento y ventana de 24 h abierta) y se mide desde la apertura del horario |

Horario y zona horaria salen de la configuración de la instancia (en `ec-es`: 9–21 h, `Europe/Madrid`, avisos a los 10 y 30 min). Los umbrales se siembran en `config/sla` para poder cambiarlos sin desplegar.

## Pruebas

- **Unitarias** (`domain/`): normalización, `dedupeKey`, transiciones de estado, reglas de SLA.
- **Integración** con emuladores: webhook → inbox → lead → tareas.
- **Contrato:** payloads reales anonimizados de Meta y del BSP en `functions/test/fixtures/` (sin PII).
- **Prueba de punta a punta** antes de lanzar: lead ficticio desde un anuncio de prueba hasta la conversión offline.
