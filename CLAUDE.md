# CLAUDE.md

@AGENTS.md

## Específico de Claude Code

- Antes de implementar, lee la spec: el issue de Ticket Studio (secciones `## Historia` y `## Especificación`) o, si el cambio toca varias piezas, la spec en `docs/specs/`. Si ninguna existe, redáctala primero y pide aprobación.
- Para tareas grandes, propone un plan con los archivos que vas a tocar antes de editar.
- Tras cada cambio: `pnpm lint && pnpm typecheck && pnpm test`. Si tocas `functions/src/agents/`, ejecuta también `pnpm evals`.
- No ejecutes `firebase deploy` ni comandos contra el proyecto `prod`.
- Reutiliza skills y comandos del repositorio agent-playbook cuando apliquen.
