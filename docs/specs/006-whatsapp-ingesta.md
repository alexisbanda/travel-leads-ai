# Spec 006 · Ingesta de WhatsApp (webhook → inbox → lead → mensajes)

- **Issue:** #52
- **Estado:** En revisión
- **Autor:** equipo del motor
- **Área:** functions · data

## Contexto

WhatsApp es el canal principal de conversación con el viajero, pero hoy no llega nada al motor. Esta spec define el flujo completo con el primer adaptador elegido en el [ADR 0007](../adr/0007-whatsapp-cloud-api-adaptador.md) (Cloud API de Meta, `bsp: meta_cloud`):

- **Entrada:** `whatsappWebhook` verifica la firma y guarda cada entrega en `inbox/` (#53).
- **Lead:** `processWhatsappInbox` crea o reengancha el lead con `source: "whatsapp"` y atribución Click to WhatsApp (CTWA), y guarda un resumen en `leads/{leadId}/messages/` (#54).
- **Salida:** la tarea `whatsapp.welcome` envía una plantilla de bienvenida cuando entra un lead de landing o de Meta Lead Ads con teléfono (ticket nuevo).
- **Primera respuesta:** qué mensaje saliente escribe `sla.firstResponseAt` (#55).

Reutiliza el patrón de webhook, la deduplicación y `runIngestTransaction` de la [spec 001](001-ingesta-lead-landing.md) y la [spec 004](004-meta-lead-ads-ingesta.md), y las tareas de la [spec 003](003-on-lead-created.md). Referencias: [doc 02](../02-modelo-de-datos.md), [doc 03](../03-registro-de-leads.md), [doc 06](../06-agentes-ia.md) («Restricciones de WhatsApp»), [doc 08](../08-seguridad-y-cumplimiento.md) y [doc 11](../11-instancias-y-configuracion.md).

## Comportamiento esperado

### 1. Webhook (`whatsappWebhook`, HTTPS `onRequest`)

1. `GET`: verificación de suscripción de Meta. Si `hub.mode === "subscribe"` y `hub.verify_token` coincide (comparación en tiempo constante, como `matchesVerifyToken`) con el secreto `channels.whatsapp.cloudApi.verifyTokenSecret`, responde `200` con `hub.challenge`; si no, `403`.
2. `POST`: el adaptador verifica `X-Hub-Signature-256` sobre `rawBody` con `channels.whatsapp.webhookSecret` (secreto de la app de Meta). Si falla, `401` sin escribir nada.
3. El adaptador convierte la entrega en eventos normalizados (`WhatsappEvent`, ver «Contratos»). Una entrega puede traer varios mensajes y estados.
4. Por cada evento escribe con `create()` un documento de inbox con ID determinista (ignora `ALREADY_EXISTS`):
   - mensaje entrante: `inbox/wa_in_{messageId}`;
   - estado de un saliente: `inbox/wa_st_{messageId}_{status}`.
5. Responde `200` solo cuando todas las escrituras terminan. Si alguna falla, `500` (Meta reintenta). JSON inválido con firma válida: `400`. Entrega válida sin eventos que interesen (p. ej. otro `field`): `200` sin escribir.

### 2. Proceso del inbox (`processWhatsappInbox`, `onDocumentWritten("inbox/{inboxId}")`, sin `retry`)

Solo procesa documentos `wa_*` con `source === "whatsapp"` y `status` ausente o `"pending"`, igual que `processMetaInbox`.

**Mensaje entrante (`wa_in_*`):**

1. Normaliza el remitente (`from`, sin `+`) a E.164 con `libphonenumber-js`. Si no es válido: `status: "error"`, `error: "invalid_phone"`.
2. Construye la entrada de ingesta (lógica pura en `functions/src/domain/whatsapp-lead.ts`):
   - `contact.phone` = E.164; `contact.name` = `profile.name` si viene (recortado, sin inventar apellidos).
   - Consentimiento: finalidad `contact`, canal `whatsapp`, `textVersion = compliance.legalTextsVersion`. Escribir primero equivale a pedir respuesta; **no** implica `marketing`.
   - Atribución: si hay `referral` de un anuncio (`source_type: "ad"`): `ctwaClid`, `metaAdId = source_id`, y `firstTouchAt` = hora del mensaje. Si el texto contiene un código de campaña entre corchetes (formato del `prefill` de las landings, p. ej. `[GAL-01]`), se guarda en `attribution.campaignCode`.
3. Ejecuta `runIngestTransaction` con el marcador de inbox (spec 004). Dentro de la misma transacción:
   - Sin lead abierto con ese `dedupeKey` (90 días): crea lead (`source: "whatsapp"`), consentimiento, `dedupe` y evento `created`.
   - Con lead abierto: **episodio nuevo** si `lead.whatsapp.lastInboundAt` falta o es anterior a 24 h → evento `reengaged` con la atribución nueva. Dentro de las 24 h no hay evento: solo se registra el mensaje.
   - Actualiza `lead.whatsapp.lastInboundAt = max(actual, timestamp del mensaje)`; nunca retrocede.
   - Crea `leads/{leadId}/messages/{messageId}` (resumen, ver «Contratos»). Si ya existe, no lo toca.
   - Marca el inbox `processed` con `leadId`.
4. Al crearse el lead, `onLeadCreated` encola sus tareas como con cualquier origen. `whatsapp.welcome` **no** se activa para `source: "whatsapp"` (el viajero ya escribió).

**Estado de un saliente (`wa_st_*`):** actualiza `status` y `statusAt` de `leads/{leadId}/messages/{messageId}` solo si el estado nuevo es posterior en el orden `sent < delivered < read` (o `failed`, que es terminal). Si el mensaje no existe en el motor, el inbox queda `processed` con `detail: "unknown_message"` y no se crea nada.

### 3. Bienvenida por plantilla (tarea `whatsapp.welcome`)

Nueva `LeadTaskAction` encolada por `onLeadCreated`. Se activa si se cumplen todas:

- `channels.whatsapp.bsp` tiene adaptador (`meta_cloud`) y `channels.whatsapp.templates.welcome` está configurada;
- el lead tiene `contact.phone`;
- `source` es `landing` o `meta_lead_ad`, y su consentimiento incluye `contact`.

El handler envía la plantilla `templates.welcome` (nombre e idioma de la configuración) con un único parámetro de cuerpo, el nombre de pila del viajero, o el texto de respaldo `templates.welcome.fallbackName` si no hay nombre. Guarda el saliente en `messages/` con `author: "automation"` y escribe el evento `whatsapp.welcome.succeeded`. Si Meta rechaza el número (no tiene WhatsApp o no es destinatario permitido del número de prueba), el resultado es `skipped` con el código de error, sin reintentos. Los errores de red o `5xx` se reintentan con la política de la spec 003.

El texto de la plantilla vive en la instancia (`instances/<id>/content/whatsapp-templates.md`) y se registra a mano en WhatsApp Manager. No menciona precios, disponibilidad ni reservas, y no la redacta un agente de IA. El aviso de IA lo pondrá el agente en su primer mensaje (#57).

### 4. Ventana de 24 h

Ningún módulo envía texto libre si `now >= lead.whatsapp.lastInboundAt + 24 h`; fuera de la ventana solo se envían plantillas. La función pura `isServiceWindowOpen(lastInboundAt, now)` en `domain/` lo decide, y el adaptador nunca recibe un envío de texto libre sin esa comprobación.

### 5. Primera respuesta

`sla.firstResponseAt` lo escribe (#55) el **primer saliente con `author` `human` o `agent_approved`** que llega a `sent`. No cuentan `automation` (bienvenida, acuses) ni `agent_draft`. Ese mismo saliente lleva el lead de `new` a `contacted` con su evento `status_changed`.

## Contratos

### Configuración (`instance.yaml`)

```yaml
channels:
  whatsapp:
    bsp: meta_cloud # nuevo valor de WhatsappBsp (ADR 0007)
    number: "+34600000000" # ficticio en draft
    webhookSecret: secret:WHATSAPP_APP_SECRET # firma X-Hub-Signature-256
    cloudApi: # obligatorio si bsp es meta_cloud
      phoneNumberId: "123456789012345"
      accessTokenSecret: secret:WHATSAPP_ACCESS_TOKEN
      verifyTokenSecret: secret:WHATSAPP_VERIFY_TOKEN
    templates: # opcional; sin welcome no se activa whatsapp.welcome
      welcome:
        name: bienvenida_lead
        language: es # código de idioma de la plantilla en Meta
        fallbackName: viajero
```

`refineInstanceConfig` exige `cloudApi` cuando `bsp === "meta_cloud"`. Ningún valor depende del país en el código: todo sale de la instancia o del pack.

### Evento normalizado del adaptador

```ts
type WhatsappEvent =
  | {
      kind: "inbound";
      messageId: string; // wamid
      from: string; // wa_id, dígitos sin "+"
      timestamp: Date;
      type:
        | "text"
        | "image"
        | "audio"
        | "video"
        | "document"
        | "location"
        | "button"
        | "interactive"
        | "other";
      text?: string; // solo text, button o interactive
      profileName?: string;
      referral?: {
        sourceType: "ad" | "post" | "other";
        sourceId?: string;
        ctwaClid?: string;
        headline?: string;
      };
    }
  | {
      kind: "status";
      messageId: string;
      status: "sent" | "delivered" | "read" | "failed";
      timestamp: Date;
      errorCode?: number;
    };

interface WhatsappBspAdapter {
  verifySignature(rawBody: Buffer, headers: Record<string, string | undefined>): boolean;
  parseDelivery(body: unknown): WhatsappEvent[]; // lanza si el JSON no tiene la forma esperada
  sendTemplate(input: {
    to: string;
    name: string;
    language: string;
    bodyParams: string[];
  }): Promise<{ messageId: string }>;
  sendText(input: { to: string; text: string }): Promise<{ messageId: string }>;
}
```

### Documentos nuevos (esquemas Zod en `packages/shared`)

`inbox/{inboxId}` (`WhatsappInboxDoc`): `source: "whatsapp"`, `event: WhatsappEvent` (serializado), `receivedAt`, `expiresAt` (+7 días), y los campos de proceso de la spec 004 (`status`, `leadId`, `processedAt`, `error`, `detail`).

`leads/{leadId}/messages/{messageId}` (`LeadMessage`), resumen de la conversación:

| Campo                 | Tipo                                                                       | Nota                                                                                    |
| --------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `messageId`           | string                                                                     | wamid; ID del documento                                                                 |
| `direction`           | `in` \| `out`                                                              |                                                                                         |
| `author`              | `traveler` \| `automation` \| `agent_draft` \| `agent_approved` \| `human` | `traveler` solo en `in`                                                                 |
| `type`                | igual que `WhatsappEvent.type`, más `template`                             |                                                                                         |
| `text`                | string?                                                                    | Solo texto, recortado a 1 000 caracteres. Las plantillas guardan su nombre, no el texto |
| `templateName`        | string?                                                                    | Solo `template`                                                                         |
| `at`                  | timestamp                                                                  | Hora del BSP, no la de proceso                                                          |
| `status` / `statusAt` | opcional                                                                   | Solo `out`                                                                              |

No se guardan medios, ubicaciones ni contactos compartidos: solo el `type`.

Cambios en `Lead` y `Attribution`:

- `Lead.whatsapp?: { lastInboundAt: Timestamp }`.
- `Attribution.campaignCode?: string` (máx. 20 caracteres, `[A-Z0-9-]`).
- `LeadTaskAction` += `whatsapp.welcome` (eventos `.succeeded`, `.failed`, `.skipped` derivados).

### Ejemplo de entrada (Cloud API, ficticio)

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "100000000000001",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15550000000",
              "phone_number_id": "123456789012345"
            },
            "contacts": [{ "profile": { "name": "Viajera Prueba" }, "wa_id": "15550001111" }],
            "messages": [
              {
                "from": "15550001111",
                "id": "wamid.TEST0001",
                "timestamp": "1795000000",
                "type": "text",
                "text": { "body": "Hola, me interesa el viaje [GAL-01]" },
                "referral": {
                  "source_type": "ad",
                  "source_id": "120000000000001",
                  "ctwa_clid": "ctwa-test-0001"
                }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

Los _fixtures_ del adaptador van en `functions/test/fixtures/whatsapp/` con números y nombres ficticios.

## Casos límite y errores

| Caso                                                                     | Comportamiento                                                                                       |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Misma entrega dos veces                                                  | Mismo ID de inbox → `create()` falla y se ignora. Un solo lead y un solo mensaje                     |
| Mismo mensaje en dos entregas distintas                                  | Mismo `wa_in_{messageId}` → idempotente                                                              |
| Mensajes fuera de orden                                                  | `lastInboundAt` usa el máximo; `messages/` ordena por `at`. Un estado anterior no pisa uno posterior |
| Contacto con lead abierto, < 24 h desde su último mensaje                | Solo se añade el mensaje                                                                             |
| Contacto con lead abierto, ≥ 24 h                                        | Evento `reengaged` (con atribución si trae `referral`)                                               |
| Contacto con lead cerrado (`won`, `lost`, `invalid`) o de hace > 90 días | Lead nuevo (regla de la spec 001)                                                                    |
| Lead de landing sin consentimiento `contact`                             | No se envía bienvenida (`skipped`, `no_consent`)                                                     |
| Escribe el viajero sin consentimiento previo                             | Se crea el consentimiento `contact` por canal `whatsapp`; nada de marketing                          |
| Envío de texto libre fuera de la ventana de 24 h                         | Se rechaza antes de llamar al adaptador; solo plantillas                                             |
| Destinatario no permitido en el número de prueba o sin WhatsApp          | `whatsapp.welcome.skipped` con el código de Meta; sin reintentos                                     |
| Mensaje de medio, ubicación o tipo desconocido                           | Se registra `type` sin contenido                                                                     |
| Estado de un mensaje que el motor no envió                               | Inbox `processed`, `detail: "unknown_message"`                                                       |
| Firma válida, `field` distinto de `messages`                             | `200` sin escribir                                                                                   |
| `cloudApi` ausente con `bsp: meta_cloud`                                 | `instance:validate` falla                                                                            |

## Seguridad y privacidad

- Datos personales: teléfono, nombre de perfil y texto de los mensajes. El texto se recorta y no se guardan medios.
- Los logs llevan IDs (`inboxId`, `leadId`, `messageId`) y códigos de error. Nunca teléfonos, nombres ni texto.
- Secretos (`webhookSecret`, `accessTokenSecret`, `verifyTokenSecret`) en Secret Manager del proyecto de la instancia. El token va en la cabecera `Authorization`, nunca en la URL.
- Región: con número real, _local storage_ de Cloud API activado en la región del pack de mercado antes del primer mensaje (ADR 0007). Va en la lista de operación de la instancia (#23).
- `eraseLead` borra también `leads/{leadId}/messages/`.
- Ningún texto entrante se envía a un LLM sin el filtro de PII (#56); esta spec no llama a ninguno.
- Demo y pruebas: solo números ficticios o teléfonos propios de personas que lo aceptan. Ningún dato real en _fixtures_ ni logs.

## Criterios de aceptación

- [ ] `WhatsappBsp` incluye `meta_cloud`; `channels.whatsapp.cloudApi` y `templates` validados, con `cloudApi` obligatorio para `meta_cloud`. Doc 11 actualizado
- [ ] Esquemas `WhatsappInboxDoc`, `LeadMessage`, `Lead.whatsapp` y `Attribution.campaignCode` en `packages/shared`, con doc 02 actualizado
- [ ] Webhook: firma inválida → `401` sin escrituras; entrega duplicada → un solo documento; fallo de escritura → `500`; JSON inválido → `400` (#53)
- [ ] Mensaje con `referral` de anuncio crea el lead con `ctwaClid` y `metaAdId`; el código `[XXX-NN]` va a `campaignCode` (#54)
- [ ] Episodio nuevo (≥ 24 h) genera `reengaged`; dentro de 24 h no hay evento (#54)
- [ ] `messages/` guarda solo los campos de la tabla; sin medios (#54)
- [ ] Lead de landing con teléfono y consentimiento recibe la plantilla de bienvenida; los de `source: "whatsapp"` no
- [ ] `sla.firstResponseAt` solo con `human` o `agent_approved` (#55)
- [ ] Logs sin teléfonos ni texto
- [ ] `./scripts/check-hardcoding.sh` en verde

## Fuera de alcance

- Agente de calificación, borradores y bandeja de aprobación (#57, #58; bandeja según ADR 0007).
- Descargar o guardar medios.
- Plantillas de marketing y su opt-in.
- Conversiones de CTWA hacia Meta (épica #21).
- Alta del número real, verificación del negocio y _local storage_ (#23).

## Plan de pruebas

- **Unitarias (`domain/`):** normalización del remitente, mapeo a la entrada de ingesta, extracción de `campaignCode`, regla de episodio de 24 h, `isServiceWindowOpen`, orden de estados, condiciones de `whatsapp.welcome`.
- **Adaptador:** `verifySignature` y `parseDelivery` contra _fixtures_ ficticios de Cloud API (texto, medio, `referral`, estados, varias entregas en un cuerpo, `field` ajeno).
- **Emulador:** webhook → inbox → lead → `messages/` → tareas; duplicados y fuera de orden; landing → lead → `whatsapp.welcome` con el adaptador simulado.
- **Manual (demo):** número de prueba de Meta + túnel público al emulador; un teléfono propio registrado como destinatario. Landing → bienvenida en el móvil → respuesta → mensaje en `messages/` del mismo lead.
