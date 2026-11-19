# Spec 003 · Orquestación tras crear un lead (`onLeadCreated`)

- **Issue:** #15
- **Estado:** Aprobada
- **Autor:** equipo del motor
- **Área:** functions

## Contexto

Cuando se crea un lead (spec 001, webhook de Meta) nadie se entera: no llega al CRM, no se avisa a la agencia ni se informa a Meta. Esta spec define cómo el motor reacciona al alta de `leads/{leadId}` encolando **tareas independientes con reintentos** en Cloud Tasks, una por acción. Ver [docs/02-modelo-de-datos.md](../02-modelo-de-datos.md) (eventos del lead), [docs/03-registro-de-leads.md](../03-registro-de-leads.md) y [docs/11-instancias-y-configuracion.md](../11-instancias-y-configuracion.md).

El proveedor de CRM aún no está decidido (ADR pendiente): el CRM se usa a través de la interfaz `CrmAdapter`, con un adaptador en memoria solo para desarrollo. El aviso por email llega en el ticket #16 y el evento a Meta CAPI en #17; aquí se deja el camino preparado.

## Comportamiento esperado

1. Se crea `leads/{leadId}`. El trigger `onLeadCreated` (`onDocumentCreated("leads/{leadId}")`, con `retry: true`) se dispara.
2. Si el evento tiene más de 50 minutos, el trigger lo registra como error y termina sin encolar (ver «Casos límite»).
3. Calcula las acciones activas a partir de la configuración resuelta de la instancia (`activeLeadTasks`):
   - `crm.upsert`: siempre (`channels.crm` es obligatorio).
   - `agency.notify`: siempre (el handler decide si hay canal).
   - `meta.capi.lead`: solo si `channels.meta.pixelId` no está vacío.
4. Encola una tarea por acción en la cola de su función (`crmUpsertTask`, `agencyNotifyTask`, `metaCapiLeadTask`), con payload `{ leadId }` y un **ID de idempotencia** derivado del `leadId`: `crm-upsert-<leadId>`, `agency-notify-<leadId>`, `meta-capi-lead-<leadId>`. Si Cloud Tasks responde que la tarea ya existe (`task-already-exists`), cuenta como éxito. Intenta encolar todas aunque falle alguna; si alguna falla, el trigger lanza para que se reintente (las que ya estaban encoladas no se duplican).
5. Cada tarea se ejecuta por separado, con su propio `retryConfig` (5 intentos, _backoff_ de 10 s a 300 s) y `rateLimits` modestos. El fallo de una no afecta a las demás.
6. Cada ejecución añade un evento al lead en `leads/{leadId}/events` con tipo `<acción>.<resultado>` (`succeeded`, `failed` o `skipped`), `actor: "system"` y, si aplica, `detail`.

### `crm.upsert`

- `crmAdapterFor(config)` devuelve el `CrmAdapter` del proveedor: `InMemoryCrmAdapter` si `channels.crm.provider` es `memory`; `null` para `hubspot` y `pipedrive` hasta que exista su adaptador.
- Con adaptador: `upsert(lead)` devuelve `{ contactId, dealId }`; se guardan en `lead.crm.contactId` y `lead.crm.dealId` (y `updatedAt`) junto al evento `crm.upsert.succeeded`, en un mismo _batch_.
- Sin adaptador: evento `crm.upsert.skipped` con `detail: "not_implemented"`; no lanza y **nunca** escribe IDs inventados.
- Si el adaptador lanza: evento `crm.upsert.failed` con `detail` = nombre del error y se re-lanza para que Cloud Tasks reintente.

### `agency.notify`

- `notifierFor(config)` elige el `Notifier` según `agency.notify.channel`, a partir de un registro de implementaciones por canal (vacío hoy; #16 registrará `email`).
- Sin `agency.notify` en la configuración: `logger.warn` (sin datos personales) y evento `agency.notify.skipped` con `detail: "no_channel"`. No falla.
- Canal configurado sin implementación: evento `agency.notify.skipped` con `detail: "not_implemented"`.
- Notifier que lanza: evento `agency.notify.failed` con el nombre del error y se re-lanza.
- Éxito: evento `agency.notify.succeeded`.

### `meta.capi.lead`

Hasta #17 no hace nada: evento `meta.capi.lead.skipped` con `detail: "not_implemented"`.

## Contratos

- **Payload de tarea:** `{ "leadId": "01JC0000000000000000000000" }` (ULID).
- **`LeadTaskAction`** (`@tla/shared`): `crm.upsert` · `agency.notify` · `meta.capi.lead`. **`LeadTaskOutcome`**: `succeeded` · `failed` · `skipped`.
- **`LeadEventType`** se amplía con los 9 tipos `<acción>.<resultado>`, generados a partir de las dos listas.
- **`LeadEvent.detail`** (opcional): código corto sin datos personales (`^[A-Za-z0-9_.-]+$`, máx. 100), p. ej. `not_implemented`, `no_channel`, `invalid_lead` o el nombre del error (`TypeError`).
- **`CrmProvider`** admite `memory` (solo desarrollo, hasta el ADR de CRM). **`agency.notify`** pasa a ser opcional.
- **`CrmAdapter`**: `upsert(lead: CrmLeadInput): Promise<{ contactId: string; dealId: string }>`; `CrmLeadInput` = `leadId`, `dedupeKey`, `source`, `contact`, `interest` del lead.
- **`Notifier`**: `notify(lead: NotifyLeadInput): Promise<void>`.
- **`TaskEnqueuer`**: `enqueue({ functionName, id, payload }) → "enqueued" | "already_exists"`. La implementación real usa `getFunctions().taskQueue("locations/<infra.region>/functions/<nombre>")` de `firebase-admin/functions` (sin la región, el SDK usaría una región por defecto que no es la de la instancia).

Ejemplo de evento:

```json
{
  "type": "crm.upsert.failed",
  "actor": "system",
  "at": "2030-01-15T10:00:05Z",
  "detail": "CrmUnavailableError"
}
```

## Casos límite y errores

| Caso                                     | Comportamiento                                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger entregado dos veces              | Los IDs de tarea coinciden: `task-already-exists` cuenta como éxito; no hay tareas duplicadas                                                       |
| Falla el encolado de una acción          | Se intentan las demás; el trigger lanza y se reintenta. Las ya encoladas devuelven `already_exists`                                                 |
| Evento del trigger con más de 50 minutos | Se descarta con `logger.error`: Cloud Tasks solo deduplica IDs durante ~1 hora tras ejecutar la tarea, y reencolar más tarde podría duplicar avisos |
| Payload sin `leadId` válido              | `logger.warn` y fin, sin reintento (reintentar no lo arregla)                                                                                       |
| El lead ya no existe                     | `logger.warn` y fin, sin evento                                                                                                                     |
| El lead no cumple el esquema mínimo      | `crm.upsert` / `agency.notify`: evento `failed` con `detail: "invalid_lead"`, sin reintento                                                         |
| El CRM falla                             | `crm.upsert.failed` y reintento según `retryConfig`; `agency.notify` sigue su curso                                                                 |
| Proveedor de CRM sin adaptador           | `crm.upsert.skipped` (`not_implemented`)                                                                                                            |
| Sin canal de aviso                       | `agency.notify.skipped` (`no_channel`) + aviso en logs                                                                                              |

## Seguridad y privacidad

- Las tareas solo transportan el `leadId`; los datos se leen del lead en el servidor.
- Logs: solo `leadId`, acción, resultado y nombre del error. Nunca nombre, teléfono ni email.
- `detail` es un código validado por formato; el nombre del error se sanea antes de guardarlo (si no cumple el formato, se guarda `Error`).
- El adaptador en memoria no persiste nada fuera del proceso y solo se elige con `provider: memory`.

## Criterios de aceptación

- [ ] Al crear un lead se encola una tarea por acción activa, cada una con su ID de idempotencia derivado del `leadId`.
- [ ] Si `crm.upsert` falla, `agency.notify` se ejecuta igual y `crm.upsert` se reintenta según su política.
- [ ] `crm.upsert` usa `CrmAdapter`; el adaptador en memoria guarda contacto y deal y el lead guarda los IDs devueltos.
- [ ] `agency.notify` usa el `Notifier` elegido por la configuración; sin canal registra un aviso y no falla.
- [ ] Cada tarea ejecutada añade un evento al lead con su resultado.

## Fuera de alcance

- Adaptador real de CRM (tras el ADR de CRM).
- Envío real del email (#16).
- Evento a Meta CAPI (#17).
- Arrancar el agente de calificación (épica WhatsApp).

## Plan de pruebas

- Unitarias (`domain/lead-tasks`): acciones activas según `pixelId`, formato de los IDs de tarea, nombre del evento, saneado del `detail`, antigüedad del evento.
- Unitarias (`triggers`, `tasks`, `integrations`): encolado con un `TaskEnqueuer` falso (3 o 2 tareas; reencolar no duplica), `task-already-exists` como éxito, handlers con dependencias falsas (CRM que lanza → `failed` + re-lanza; notify sin canal → `skipped` sin lanzar), `retryConfig` presente en la definición de cada tarea.
- Emulador de Firestore (`pnpm --filter functions test:emulator`): lead creado en el emulador → `crm.contactId`/`crm.dealId` escritos con el adaptador en memoria y eventos `<acción>.<resultado>` en `events/`.
