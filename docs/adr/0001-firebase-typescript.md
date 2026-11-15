# ADR 0001 · Firebase + TypeScript como stack único

- **Estado:** Aceptada
- **Fecha:** 2026-11-09
- **Decisores:** Tech lead

## Contexto

Equipo pequeño (tech lead + junior) con apoyo intensivo de IA. El volumen inicial de leads es bajo y el proyecto debe arrancar en semanas. El tech lead ya usa Firebase en otros proyectos y domina React/Next.js y Laravel.

## Opciones consideradas

1. **Laravel + MySQL + Next.js:** máxima experiencia del tech lead y SQL relacional; pero dos lenguajes, servidores que mantener y más curva para el junior.
2. **Firebase + TypeScript (Next.js, Functions, Firestore):** un solo lenguaje, serverless, coste casi nulo a bajo volumen, ya conocido; Firestore es NoSQL.
3. **Supabase + Next.js:** Postgres gestionado; ecosistema nuevo para el equipo.

## Decisión

Opción 2. TypeScript de punta a punta con esquemas compartidos (Zod) y Firestore en la región que exija el mercado de cada instancia. Las consultas analíticas se resuelven en BigQuery mediante la extensión de exportación.

## Consecuencias

- Positivas: menos piezas, despliegues simples, tipos compartidos front/back, buen encaje con Claude Code.
- Negativas: consultas relacionales complejas en Firestore; dependencia de Google Cloud.
- Revisar si: las reglas de comisión se vuelven muy relacionales o el sistema pasa a ser multiagencia. Alternativa dentro del ecosistema: Firebase Data Connect (PostgreSQL).
