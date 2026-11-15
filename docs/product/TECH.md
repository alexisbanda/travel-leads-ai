# Brief técnico: Travel Leads AI

> Escrito por el tech lead en modo arranque exprés. Resume las decisiones de `docs/01-arquitectura.md`, `docs/11-instancias-y-configuracion.md` y los ADR 0001–0006; ante una contradicción, mandan los ADR. El ticket 0 de cimientos depende de este documento.

## Stack

- TypeScript en todo el monorepo, con pnpm workspaces (`apps/*`, `functions`, `packages/*`). Node 22 (fijado en `.nvmrc` y `engines`), pnpm 10 con Corepack.
- Front: Next.js (App Router) + React en Firebase App Hosting (`apps/landings`).
- Backend: Cloud Functions de 2.ª generación (`functions/`); servidor MCP del catálogo en Cloud Run (`apps/mcp-catalog`).
- Datos: Firestore en modo nativo; exportación a BigQuery.
- Esquemas y configuración: Zod en `packages/shared` como fuente de verdad, incluido `InstanceConfig`.
- IA: API de Claude (tool use) y Gemini para los agentes de producción.
- Calidad: ESLint, Prettier, Vitest; `tsc --noEmit` para el typecheck.

## Arquitectura

- **Motor genérico + instancias aisladas** (ADR 0006). La configuración se resuelve por capas: pack de mercado (`packages/markets/{iso}`) → pack de destino (`packages/destinations/{iso}`) → `instances/{id}/instance.yaml`. `pnpm instance:build {id}` genera `generated/instance.json`; el código lee siempre de ahí y los valores operativos de Firestore `config/*`.
- **El motor no conoce países:** en `apps/`, `functions/` y `packages/shared` no hay nombres de países, monedas, prefijos, regiones ni textos legales. Lo comprueba `scripts/check-hardcoding.sh` en CI.
- **Registro de leads propio** (ADR 0003) como fuente de verdad: webhooks HTTPS que responden rápido y guardan en `inbox/`, triggers de Firestore idempotentes, orquestación con Cloud Tasks (CRM, aviso a la agencia, Meta CAPI) y `slaWatchdog` con Cloud Scheduler.
- **Lógica de negocio pura** en `functions/src/domain/`, sin imports de Firebase ni SDKs; integraciones en `functions/src/integrations/`; agentes en `functions/src/agents/`.
- **Agentes en modo asistido** (ADR 0005); catálogo expuesto por MCP de solo lectura (ADR 0004); CRM SaaS (ADR 0002).

## Datos

- Colecciones principales: `leads` (con subcolecciones `events` y `messages`), `consents`, `dedupe`, `inbox` (TTL 7 días), `sales`, `catalog_tours`, `agent_runs`, `config/*`. Detalle en `docs/02-modelo-de-datos.md`.
- Máquina de estados del lead: `new → contacted → qualified → handed_off → quoted → won | lost`, y `invalid`.
- Deduplicación por `dedupeKey = sha256(phoneE164 ?? email)` en una transacción sobre `dedupe/{dedupeKey}`, ventana de 90 días.
- Datos personales: nombre, teléfono, email y datos del viaje; nada de documentos de identidad ni salud. Retención según `compliance.dataRetentionMonths` (24 meses por defecto en el pack `es`); `eraseLead` borra o anonimiza en Firestore, CRM y BSP.
- Región: la de la instancia (`europe-southwest1` y BigQuery `EU` en `ec-es`). Las reglas de Firestore deniegan todo acceso desde clientes.

## Integraciones externas

| Servicio | Uso | Estado |
| --- | --- | --- |
| Meta (Lead Ads, Pixel, Conversions API) | Captación y conversiones `Lead` y `Purchase` | Cuentas pendientes (épica 7) |
| WhatsApp Business vía BSP | Primer contacto y calificación | Proveedor sin decidir |
| CRM SaaS (HubSpot o Pipedrive) | Pipeline comercial de la agencia | Sin decidir |
| API de Claude y Gemini | Agentes de calificación y propuestas | Pago por uso, aparte de las suscripciones |
| GTM, GA4, Looker Studio, BigQuery | Medición | Pendiente |
| reCAPTCHA Enterprise (App Check) | Protección del formulario | Pendiente |

Los secretos van en Secret Manager del proyecto de cada instancia; en `instance.yaml` solo referencias `secret:NOMBRE`.

## Cómo se prueba

- `pnpm lint && pnpm typecheck && pnpm test` en la raíz (Vitest en cada paquete). Comando de tests de agent-playbook: `pnpm test` con Node 22.
- Unitarios obligatorios en `functions/src/domain/` (normalización, `dedupeKey`, transiciones, SLA) y en los esquemas de `packages/shared`.
- Integración con los emuladores de Firebase (`firebase emulators:start`): webhook → inbox → lead → tareas.
- Contrato: payloads anonimizados de Meta y del BSP en `functions/test/fixtures/`, sin datos personales reales.
- `pnpm instance:validate` sobre todas las instancias y `./scripts/check-hardcoding.sh` en cada PR.
- `pnpm evals` obligatorio si se tocan prompts o tools de agentes.
- Prueba de punta a punta antes de lanzar: `docs/specs/002-prueba-punta-a-punta.md`, con datos ficticios.

## Entornos y despliegue

- **Local:** emuladores de Firebase (Functions, Firestore, UI en `:4000`) y `INSTANCE=ec-es pnpm dev`.
- **dev:** proyecto `tla-ec-es-dev` (ya existe). Despliegue manual por ahora.
- **prod:** proyecto `tla-ec-es-prod` (pendiente de crear). Ningún agente ni comando automatizado actúa contra prod.
- **CI (GitHub Actions):** en cada PR, lint, typecheck, test, `check-hardcoding` e `instance:validate`. El despliegue automático a dev y a prod por tags se aborda en la épica «Despliegue por instancia».
- Ramas `feat|fix|docs|chore/{n}-desc`, Conventional Commits en inglés, PR pequeños con squash.

## Decisiones pendientes

- [ ] CRM (HubSpot o Pipedrive) y proveedor de WhatsApp para `ec-es`: ADR pendiente.
- [ ] Consumir Claude y Gemini por API directa o por Vertex AI en la región de la instancia (facturación, región e IAM en el mismo proyecto): ADR pendiente.
- [ ] Autenticación de CI con Google Cloud mediante Workload Identity Federation, cuando se automatice el despliegue.
- [ ] Crear `tla-ec-es-prod` en región europea con plan Blaze y alertas de presupuesto.
