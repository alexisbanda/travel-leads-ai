# functions

Backend en **Cloud Functions for Firebase (2ª gen) con Node 22 + TypeScript**. La región se toma de la configuración resuelta de la instancia (`setGlobalOptions`); nunca se escribe en el código.

> Estado: cimientos del paquete listos (build, lint, typecheck, test y `domain/` mínimo); las funciones listadas abajo están pendientes.

## Funciones previstas

| Función | Tipo | Propósito |
| --- | --- | --- |
| `ingestLandingLead` | HTTPS (callable o onRequest + App Check) | Recibe formularios de las landings |
| `metaLeadWebhook` | HTTPS onRequest | Webhook de Meta Lead Ads (verificación + firma) |
| `processMetaInbox` | Trigger Firestore (`inbox/{inboxId}`) | Lee el lead de la Graph API (token `channels.meta.pageTokenSecret`), lo mapea y crea o reengancha el lead `meta_lead_ad`. Los errores quedan en el inbox (`status: "error"`); se reintenta volviendo a `pending` ([spec 004](../docs/specs/004-meta-lead-ads-ingesta.md)). En el emulador, `META_GRAPH_API_BASE_URL` apunta la Graph API a un _stub_ local |
| `whatsappWebhook` | HTTPS onRequest | Webhook del proveedor de WhatsApp (BSP) |
| `onLeadCreated` | Trigger Firestore | Encola una tarea por acción activa con ID de idempotencia ([spec 003](../docs/specs/003-on-lead-created.md)) |
| `crmUpsertTask` · `agencyNotifyTask` · `metaCapiLeadTask` | Cloud Tasks (`onTaskDispatched`) | Alta en el CRM (`CrmAdapter`), aviso a la agencia (`Notifier`) y evento CAPI, cada una con sus reintentos. El nombre de la función es el de su cola |
| `slaWatchdog` | Scheduler (cada 5 min) | Alerta de leads sin respuesta |
| `crmWebhook` | HTTPS onRequest | Cambios de etapa en el CRM → actualiza el lead y envía conversiones offline |
| `qualificationAgent` | Interno | Agente de calificación (modo asistido) |
| `proposalAgent` | Interno | Borrador de propuesta para el vendedor de la agencia |

## Estructura prevista

```
functions/src/
├── index.ts                 # Solo exporta funciones
├── http/                    # Adaptadores HTTP y webhooks
├── triggers/                # Triggers de Firestore y scheduler
├── tasks/                   # Tareas de Cloud Tasks tras crear un lead (handlers testeables)
├── domain/                  # Lógica pura: dedupe, normalización, reglas SLA
├── integrations/            # meta/, whatsapp/, crm/, notifier/, task-queue, anthropic/, gemini/
└── agents/                  # Prompts, herramientas, guardrails y evals
```

`pnpm build` compila primero `@tla/shared` (`prebuild`) y luego `functions` a `lib/`, para que Node (y el emulador) puedan cargar `@tla/shared` sin un loader de TypeScript.

Regla: `domain/` no importa nada de Firebase ni de SDKs externos. Así se prueba con tests unitarios sin emuladores.

Documentación: [docs/03-registro-de-leads.md](../docs/03-registro-de-leads.md), [docs/06-agentes-ia.md](../docs/06-agentes-ia.md)
