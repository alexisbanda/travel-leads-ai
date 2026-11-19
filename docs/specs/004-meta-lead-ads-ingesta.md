# Spec 004 · Ingesta de Meta Lead Ads (`processMetaInbox`)

- **Issue:** #14
- **Estado:** Aprobada
- **Autor:** equipo del motor
- **Área:** functions

## Contexto

El webhook de Meta Lead Ads (#13, `metaLeadWebhook`) verifica la firma y guarda cada entrega en `inbox/meta_<leadgen_id>`, pero nadie la convierte en lead. Esta spec define el trigger que obtiene los datos del lead de la Graph API, los mapea según la configuración de la instancia y crea o reengancha el lead con `source: "meta_lead_ad"`, **reutilizando la transacción de creación y deduplicación de la landing** ([spec 001](001-ingesta-lead-landing.md)). Al crearse el lead, `onLeadCreated` ([spec 003](003-on-lead-created.md)) encola sus tareas como con cualquier otro lead.

Referencias: [docs/02-modelo-de-datos.md](../02-modelo-de-datos.md), [docs/03-registro-de-leads.md](../03-registro-de-leads.md) («Patrón de webhook», «Deduplicación de personas») y [docs/11-instancias-y-configuracion.md](../11-instancias-y-configuracion.md).

## Comportamiento esperado

1. Se escribe `inbox/{inboxId}`. El trigger `processMetaInbox` (`onDocumentWritten("inbox/{inboxId}")`, sin `retry`) se dispara.
2. Solo procesa si el documento existe, el ID empieza por `meta_`, `source === "meta"` y `status` está ausente o vale `"pending"`. Así sus propias escrituras (`processed`, `error`) no lo vuelven a disparar.
3. Lee `payload.leadgen_id` (cadena de dígitos). Si falta o no es válido: `status: "error"`, `error: "missing_leadgen_id"`.
4. Pide el lead a la Graph API: `GET https://graph.facebook.com/<versión>/<leadgen_id>?fields=field_data,created_time,ad_id,adset_id,campaign_id,form_id`, con el token de página en la cabecera `Authorization: Bearer …` (nunca en la URL) y un _timeout_. La versión de la API es una constante del módulo `meta-graph-api.ts`.
5. Mapea la respuesta (lógica pura, `functions/src/domain/meta-lead.ts`):
   - Campos estándar: `full_name` (o `first_name` + `last_name`), `phone_number` y `email`. El teléfono se normaliza a E.164 con la región por defecto del mercado (`market.phoneDefaultRegion`); el email con `trim().toLowerCase()`.
   - Preguntas personalizadas: según `channels.meta.leadForm.fieldMap` (ver «Contratos»).
   - Consentimiento: siempre la finalidad `contact` (el formulario de Meta lo exige para enviarse) y `marketing` solo si una pregunta mapeada a `marketingConsent` vale verdadero. Canal `meta_form`; `textVersion` = `compliance.legalTextsVersion`.
   - Atribución: `metaCampaignId`, `metaAdsetId`, `metaAdId` (de `campaign_id`, `adset_id`, `ad_id`) y `firstTouchAt` (`created_time` del lead o, si falta, la hora de proceso). `form_id` no se guarda: el esquema `Attribution` no tiene campo para él.
6. Ejecuta `runIngestTransaction` (la misma de la landing) con un **marcador de inbox**: dentro de la transacción, antes de escribir nada, lee `inbox/{inboxId}`:
   - Si ya tiene `leadId`, devuelve ese lead con `alreadyProcessed: true` y no escribe nada.
   - Si no, aplica la deduplicación de la landing (lead abierto de menos de 90 días con el mismo `dedupeKey` → evento `reengaged` con la atribución nueva; si no, lead + consentimiento + `dedupe` + evento `created`) y, en la misma transacción, actualiza el inbox con `status: "processed"`, `leadId`, `deduplicated`, `processedAt` y borra `error`.

## Contratos

### Configuración (`instance.yaml`)

```yaml
channels:
  meta:
    pageTokenSecret: secret:META_PAGE_ACCESS_TOKEN # token de página para la Graph API
    leadForm: # opcional
      fieldMap:
        cuando_quieres_viajar: # clave de la pregunta en el formulario de Meta
          field: travelMonth
          values:
            marzo_2027: "2027-03"
        comentarios: notes # forma corta: la respuesta se usa tal cual
```

- `pageTokenSecret`: `secret:NOMBRE` (obligatorio). La función declara el secreto con ese nombre (`defineSecret`).
- `leadForm.fieldMap`: `Record<claveDePregunta, FieldMapping>`, por defecto `{}`. `FieldMapping` es el nombre del campo destino o `{ field, values }` para preguntas de opción múltiple (`values`: respuesta → valor).
- Campos destino (lista cerrada `LeadFormField`): `travelMonth` (`AAAA-MM`), `paxAdults` (entero ≥ 1), `paxChildren` (entero ≥ 0), `budgetRange` (`<N`, `N-M` o `>N`), `segment` (`adventure` · `couple` · `senior` · `diaspora` · `other`), `notes` (texto), `marketingConsent` (booleano). El esquema rechaza destinos desconocidos y valores de `values` que no validen contra su destino.
- Con la forma corta, la respuesta se convierte al tipo del destino: enteros para `paxAdults`/`paxChildren`, `true`/`false` para `marketingConsent`; el resto se usa como texto.

### Documento `inbox/meta_<leadgen_id>`

Además de lo que escribe el webhook (`source`, `payload`, `receivedAt`, `expiresAt`):

| Campo           | Tipo                              | Notas                                          |
| --------------- | --------------------------------- | ---------------------------------------------- |
| `status`        | `pending` · `processed` · `error` | Ausente = pendiente                            |
| `leadId`        | string                            | Lead creado o reenganchado                     |
| `deduplicated`  | boolean                           | `true` si se reenganchó un lead existente      |
| `processedAt`   | timestamp                         |                                                |
| `attempts`      | number                            | Intentos fallidos (`FieldValue.increment(1)`)  |
| `error`         | string                            | Código del último error (sin datos personales) |
| `lastAttemptAt` | timestamp                         | Último intento fallido                         |

**Reintentar** una entrega con error: volver a poner `status: "pending"` (consola o script). El trigger la procesa de nuevo.

### Códigos de error

| Código                       | Causa                                                       | ¿Reintentar sirve?             |
| ---------------------------- | ----------------------------------------------------------- | ------------------------------ |
| `graph_api_<status>`         | La Graph API respondió con un status no 2xx                 | Sí                             |
| `graph_api_network`          | Red o _timeout_                                             | Sí                             |
| `graph_api_invalid_response` | Respuesta que no es JSON o no tiene la forma esperada       | Probablemente no               |
| `missing_leadgen_id`         | El payload no trae `leadgen_id` válido                      | No                             |
| `invalid_lead_data`          | Sin teléfono ni email válidos, o sin nombre                 | No                             |
| `invalid_text_version`       | `compliance.legalTextsVersion` vacío o con formato inválido | Tras corregir la configuración |
| `internal_error`             | Fallo inesperado (p. ej. de Firestore en la transacción)    | Sí                             |

## Casos límite y errores

| Caso                                                                          | Comportamiento                                                                                                                                                                              |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Graph API 500 o red caída                                                     | Inbox `status: "error"`, `attempts` +1, `error`, `lastAttemptAt`; no se crea nada; el trigger no lanza (evita bucles)                                                                       |
| Mismo documento procesado dos veces (entrega duplicada del evento)            | La transacción ve `leadId` en el inbox: un solo lead, sin `reengaged` espurio                                                                                                               |
| Dos entregas distintas de la misma persona en menos de 90 días                | Un lead y un evento `reengaged` con la atribución de la segunda                                                                                                                             |
| Teléfono inválido pero email válido                                           | Lead solo con email; `phone_number` se informa como clave descartada                                                                                                                        |
| Respuesta de una pregunta mapeada que no valida (p. ej. mes no `AAAA-MM`)     | Se descarta ese campo sin fallar; se registra solo la clave de la pregunta                                                                                                                  |
| `paxChildren` sin `paxAdults`                                                 | Se descarta (`Pax` exige adultos)                                                                                                                                                           |
| `compliance.legalTextsVersion` vacío (instancia sin textos legales revisados) | No se crea lead: inbox `error: "invalid_text_version"`. Un consentimiento sin versión de texto no sirve como evidencia                                                                      |
| Documento con `status` `processed` o `error`                                  | Se ignora                                                                                                                                                                                   |
| Error inesperado en la transacción                                            | Se registra (`errorName`) y se marca el inbox con `internal_error` para que quede visible y sea reintentable; si tampoco se puede marcar, el trigger lanza (sin `retry`, queda en los logs) |
| Documento borrado                                                             | Se ignora                                                                                                                                                                                   |

## Seguridad y privacidad

- Datos personales: nombre, teléfono, email y respuestas del formulario. Solo viajan de la Graph API al lead y al consentimiento; el inbox guarda únicamente el payload del webhook (ids).
- El token de página vive en Secret Manager (`channels.meta.pageTokenSecret`) y va en la cabecera `Authorization`, nunca en la URL ni en los logs.
- Un status no 2xx de la Graph API produce `MetaGraphApiError` con el status, nunca el cuerpo (puede traer datos personales).
- La URL base es `https://graph.facebook.com`; solo con `FUNCTIONS_EMULATOR === "true"` se puede sobrescribir con `META_GRAPH_API_BASE_URL` (para probar contra un _stub_ local).
- Logs: solo `inboxId`, `leadId`, resultado, código de error, nombre del error y claves de preguntas descartadas. Nunca nombre, teléfono, email ni respuestas.

## Criterios de aceptación

- [ ] Con un fixture de entrega y una respuesta simulada de la Graph API se crea un lead `meta_lead_ad` con nombre, teléfono, email, atribución de campaña, conjunto y anuncio, y consentimiento `meta_form`; el inbox queda `processed` con `leadId`.
- [ ] Las preguntas personalizadas se mapean según `channels.meta.leadForm.fieldMap`; el esquema rechaza destinos desconocidos y valores inválidos.
- [ ] Procesar dos veces el mismo inbox deja un solo lead; la deduplicación de 90 días funciona igual que en la landing (`reengaged`).
- [ ] Un error de la Graph API deja el inbox con `status: "error"`, `attempts: 1`, sin lead, consentimiento ni `dedupe`; al volver a `pending` con la Graph API respondiendo bien, se procesa.

## Fuera de alcance

- Alta de la app, permisos y token de página en Meta (épica de operación ec-es).
- Enviar el evento a CAPI (otro ticket).
- Reintentos automáticos con _backoff_ de las entregas con error.

## Plan de pruebas

- Unitarias: `domain/meta-lead.test.ts` (parseo, campos estándar, `fieldMap`, consentimiento, atribución, errores), `integrations/meta-graph-api.test.ts` (`fetch` simulado: URL, cabecera, errores, _timeout_, URL base), `triggers/process-meta-inbox.test.ts` (filtros y errores con _fakes_) y `instance-config.test.ts` (esquema de `leadForm`).
- Emulador de Firestore: `triggers/process-meta-inbox.emulator.test.ts` (lead creado, doble proceso, `reengaged`, error de Graph API y reintento).
