# ADR 0004 · Catálogo estructurado expuesto por MCP

- **Estado:** Aceptada (implementación en fase piloto)
- **Fecha:** 2026-11-14

## Contexto

Los programas de la agencia están en PDFs. Los agentes de IA necesitan datos fiables para no inventar. El sector de viajes ha adoptado MCP como capa común para que los agentes consulten inventario (GDS, OTAs y operadores de tours ya publican servidores MCP).

## Opciones consideradas

1. Pegar los PDFs como contexto en cada prompt: rápido, pero caro, frágil y propenso a errores.
2. Catálogo en Firestore + tools internas en Functions: sirve a nuestros agentes, pero no a otros clientes.
3. Catálogo en Firestore + servidor MCP: un mismo acceso para nuestros agentes, para el equipo de la agencia desde Claude y, en el futuro, para agentes externos.

## Decisión

Opción 3, por etapas: primero el esquema y la ingesta asistida (necesarios también para las landings); el servidor MCP cuando el catálogo esté publicado.

## Consecuencias

- Positivas: una sola fuente de verdad para landings, agentes y personas; preparado para comercio agéntico.
- Negativas: un servicio más (Cloud Run) y autenticación que gestionar.
- Revisar: trimestralmente, el estado de protocolos de comercio agéntico (UCP, ACP) para tours.
