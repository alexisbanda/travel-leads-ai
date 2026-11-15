# AGENTS.md

Contexto común para cualquier agente de IA que trabaje en este repositorio (Claude Code, Gemini CLI u otros). `CLAUDE.md` y `GEMINI.md` importan este archivo.

## Proyecto

Motor genérico de captación y calificación de leads para agencias de viajes receptivas. Cada despliegue es una **instancia** (agencia × destino × mercado) definida en `instances/<id>/instance.yaml`. Lee `README.md`, `docs/00-vision.md` y `docs/11-instancias-y-configuracion.md` antes de proponer cambios de alcance.

## Reglas no negociables

1. **El motor no conoce países.** En `apps/`, `functions/` y `packages/shared` no escribas nombres de países, monedas, prefijos telefónicos, zonas horarias, regiones de GCP, textos legales ni números de teléfono. Todo sale de la configuración resuelta (`generated/instance.json`) o de `config/*` en Firestore. Lo específico va en `packages/markets/<iso>`, `packages/destinations/<iso>` o `instances/<id>/`.
2. **No vendemos viajes.** Ningún código ni prompt puede confirmar precios, disponibilidad o reservas al viajero. Los precios son siempre orientativos, con el aviso del pack de mercado.
3. **Datos personales.** Nunca escribas datos reales de leads en tests, fixtures, logs, commits ni prompts de ejemplo.
4. **Firestore solo desde el servidor.** Las reglas deniegan todo acceso de cliente. No las abras sin un ADR.
5. **Región de datos.** La define el pack de mercado de la instancia. Nunca crees recursos fuera de las regiones permitidas.
6. **Secretos** en Secret Manager del proyecto de la instancia. En `instance.yaml` solo referencias `secret:NOMBRE`.
7. **Transparencia IA.** Todo agente que hable con viajeros usa el aviso de IA del pack de mercado en su primer mensaje. No se puede desactivar.

## Cómo trabajar

- **Spec antes que código.** Un issue de Ticket Studio con las secciones `## Historia` y `## Especificación` (criterios de aceptación) ya cuenta como spec. Los flujos con varias piezas (p. ej. webhook → inbox → lead → tareas) llevan además una spec en `docs/specs/` usando `docs/specs/_plantilla.md`.
- **Decisiones de arquitectura** → nuevo ADR en `docs/adr/`.
- Cambios en el modelo de datos o en `InstanceConfig` → actualiza `packages/shared` **y** los docs 02 u 11 en el mismo PR.
- Si un cambio necesita un valor nuevo por país o agencia, añádelo al esquema de configuración con su valor por defecto en el pack correspondiente, no en el código.
- Lógica de negocio pura en `functions/src/domain/`, sin imports de Firebase ni SDKs. Tests unitarios obligatorios.
- Prueba los cambios con al menos una instancia (`INSTANCE=ec-es`). Si tocas packs o el esquema, ejecuta `pnpm instance:validate` sobre todas.
- Commits con Conventional Commits en inglés: `feat(functions): add meta lead webhook`.
- Documentación en español neutro. Los textos para viajeros van en el idioma de cada mercado, dentro de packs o instancias.

## Comandos

```bash
pnpm install
pnpm instance:validate            # todas las instancias
pnpm instance:build ec-es
pnpm lint && pnpm typecheck && pnpm test
./scripts/check-hardcoding.sh
firebase emulators:start
pnpm evals                        # obligatorio si tocas prompts o tools de agentes
```

## Mapa del código

- `apps/landings` → Next.js, plantilla de landings
- `apps/mcp-catalog` → servidor MCP del catálogo
- `functions/src/http` → webhooks y endpoints
- `functions/src/triggers` → triggers de Firestore y scheduler
- `functions/src/domain` → lógica pura
- `functions/src/integrations` → Meta, WhatsApp BSP, CRM, Anthropic, Gemini
- `functions/src/agents` → prompts base, tools, guardrails, evals del motor
- `packages/shared` → esquemas Zod (fuente de verdad), incluido `InstanceConfig`
- `packages/markets/<iso>` → packs de mercado
- `packages/destinations/<iso>` → packs de destino
- `instances/<id>` → configuración, contenido, prompts y evals de cada instancia
