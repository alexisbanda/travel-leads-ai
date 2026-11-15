# functions

Backend en **Cloud Functions for Firebase (2ª gen) con Node 22 + TypeScript**. La región se toma de la configuración resuelta de la instancia (`setGlobalOptions`); nunca se escribe en el código.

> Estado: pendiente de scaffolding (semana 1–2 del roadmap).

## Funciones previstas

| Función | Tipo | Propósito |
| --- | --- | --- |
| `ingestLandingLead` | HTTPS (callable o onRequest + App Check) | Recibe formularios de las landings |
| `metaLeadWebhook` | HTTPS onRequest | Webhook de Meta Lead Ads (verificación + firma) |
| `whatsappWebhook` | HTTPS onRequest | Webhook del proveedor de WhatsApp (BSP) |
| `onLeadCreated` | Trigger Firestore | Enriquecer, reenviar al CRM, avisar a la agencia, evento CAPI |
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
├── domain/                  # Lógica pura: dedupe, normalización, reglas SLA
├── integrations/            # meta/, whatsapp/, crm/, anthropic/, gemini/
└── agents/                  # Prompts, herramientas, guardrails y evals
```

Regla: `domain/` no importa nada de Firebase ni de SDKs externos. Así se prueba con tests unitarios sin emuladores.

Documentación: [docs/03-registro-de-leads.md](../docs/03-registro-de-leads.md), [docs/06-agentes-ia.md](../docs/06-agentes-ia.md)
