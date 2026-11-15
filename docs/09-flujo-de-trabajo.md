# 09 · Flujo de trabajo

## Git

- Rama principal: `main`, protegida. Sin pushes directos.
- Ramas: `feat/<n>-desc`, `fix/<n>-desc`, `docs/<n>-desc`, `chore/<n>-desc` (`<n>` = número de issue).
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) en inglés.
- PR pequeños (idealmente < 400 líneas), con plantilla, fusionados con **squash**.
- CI obligatorio en verde: lint, typecheck, test y evals si aplica.
- Despliegue: `main` → `dev` automático. Tag `v*` → `prod` con aprobación manual.

## Tablero

GitHub Projects con columnas: **Backlog → Listo → En curso → En revisión → Hecho**.

Una issue está **Lista** cuando tiene: objetivo claro, criterios de aceptación y, si es una funcionalidad, spec aprobada.

Etiquetas (las de tipo, riesgo, tamaño y estado las crea Ticket Studio al publicar; las de área y alcance se crean con `gh label create`):

| Tipo | Área | Otras |
| --- | --- | --- |
| `type:feature`, `type:bug`, `type:chore`, `type:docs`, `type:spec` | `area:landings`, `area:functions`, `area:agents`, `area:mcp`, `area:data`, `area:infra`, `area:content` | `scope:engine`, `instance:<id>`, `good-first-issue`, `blocked:agency`, `priority:high` |

`scope:engine` marca el trabajo del motor (sirve a todas las instancias); `instance:<id>` el de una instancia concreta, con el título prefijado `[<id>]`. `blocked:agency` marca lo que depende de material de la agencia (logo, programas, vídeos).

## Desarrollo guiado por specs

1. **Spec** en `docs/specs/NNN-nombre.md` con la plantilla. Incluye contexto, comportamiento esperado, contratos (tipos/endpoints), casos límite, criterios de aceptación y fuera de alcance.
2. Revisión de la spec (PR solo con la spec).
3. Implementación con la spec como contexto principal del agente de IA.
4. El PR enlaza la spec y marca los criterios de aceptación cumplidos.

## Trabajar con Claude y Gemini

| Tarea | Herramienta recomendada |
| --- | --- |
| Implementar funcionalidades, refactors, tests | Claude Code (lee `CLAUDE.md` → `AGENTS.md`) |
| Redactar specs y ADRs | Claude (proyecto con el contexto del negocio) |
| Copys, guiones de vídeo, variantes de anuncios | Claude y Gemini; elegir el mejor de ambos |
| Investigación de competencia, tendencias, YouTube | Gemini |
| BigQuery, GA4, Looker Studio, Google Ads | Gemini |
| Borradores de imagen o vídeo | Gemini (siempre como borrador, etiquetado, nunca como destino real) |

Reglas:

- La IA propone, **una persona revisa y es responsable** de lo que se fusiona o publica.
- Nunca pegar datos reales de leads en chats de Claude o Gemini. Revisar en ambas cuentas la configuración de uso de datos para entrenamiento.
- Prompts útiles y repetibles → convertirlos en comandos o skills reutilizables (agent-playbook).

## Onboarding del junior

### Semana 1

- [ ] Accesos: GitHub (2FA), Firebase `dev`, Meta Business (rol limitado), BSP, CRM.
- [ ] Leer: README, `docs/00`, `docs/01`, `docs/09`, `AGENTS.md`.
- [ ] Clonar, instalar y arrancar emuladores y landings en local.
- [ ] Primer PR: corregir o mejorar algo de la documentación.

### Semanas 2–4

- [ ] Issues `good-first-issue` de `area:landings` (componentes).
- [ ] Mantener la hoja de UTMs y el calendario de contenido.
- [ ] Ejecutar la prueba de punta a punta (checklist en `docs/specs/`).
- [ ] Documentar lo aprendido en cada PR.

### Responsabilidades continuas

- Operación de contenido: edición, programación, respuesta a comentarios y DMs.
- QA antes de cada lanzamiento de landing o campaña.
- Informe semanal de métricas (vistas preparadas en Looker Studio).

## Definición de hecho

- [ ] Criterios de aceptación de la spec cumplidos.
- [ ] Tests nuevos o actualizados en verde.
- [ ] Evals en verde si se tocaron agentes.
- [ ] Documentación actualizada (modelo de datos, README del paquete, ADR si aplica).
- [ ] Sin PII en código, tests, logs ni capturas.
- [ ] Probado en `dev`.
