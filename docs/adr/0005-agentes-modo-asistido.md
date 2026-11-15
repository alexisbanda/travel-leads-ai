# ADR 0005 · Agentes en modo asistido al inicio

- **Estado:** Aceptada
- **Fecha:** 2026-11-14

## Contexto

Un agente que responde solo puede prometer algo que la agencia no puede cumplir, con riesgo comercial y legal. Aún no sabemos qué preguntan de verdad los viajeros de cada mercado. Cada instancia empieza en modo asistido, aunque otra ya sea autónoma.

## Decisión

El agente de calificación redacta borradores que una persona aprueba, edita o rechaza. Cada resultado se registra en `agent_runs.outcome`.

Criterios para proponer el modo autónomo (nuevo ADR):

- ≥ 300 conversaciones registradas.
- ≥ 90 % de borradores aprobados sin edición en las últimas 4 semanas.
- 100 % de evals críticas (precio, inyección, fuera de catálogo) en verde.
- Derivación a humano funcionando y medida.

## Consecuencias

- Positivas: aprendizaje real, riesgo bajo, datos para evals.
- Negativas: requiere a una persona disponible; el tiempo de respuesta depende de ella (mitigado con alertas de SLA).
