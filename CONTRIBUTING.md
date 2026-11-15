# Cómo contribuir

Guía rápida. El detalle está en [docs/09-flujo-de-trabajo.md](docs/09-flujo-de-trabajo.md).

## Flujo

1. Coge una issue del tablero (columna **Listo**) y asígnatela.
2. Si la issue no tiene spec, escríbela en `docs/specs/` y abre un PR solo con la spec.
3. Crea una rama: `feat/<issue>-descripcion-corta`, `fix/...`, `docs/...`, `chore/...`.
4. Implementa con commits pequeños en formato Conventional Commits.
5. Antes del PR: `pnpm lint && pnpm typecheck && pnpm test` (y `pnpm evals` si tocaste agentes).
6. Abre el PR con la plantilla. Enlaza la issue con `Closes #N`.
7. El tech lead revisa. Se fusiona con **squash**.

## Reglas de oro

- Nada de datos reales de personas en el repositorio. Nunca.
- Ningún texto dirigido al viajero promete precio, disponibilidad o reserva.
- Si generas código o textos con IA, **tú** eres responsable de revisarlos antes del PR.
- ¿Dudas? Pregunta en la issue, no en privado: así queda documentado.
