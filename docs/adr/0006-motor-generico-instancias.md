# ADR 0006 · Motor genérico con instancias configurables

- **Estado:** Aceptada
- **Fecha:** 2026-11-14
- **Decisores:** Tech lead

## Contexto

El primer caso es una agencia de Ecuador captando viajeros en España, pero el mismo modelo sirve para otros destinos (Perú, Colombia…) y otros mercados emisores (Alemania, EE. UU.…). Queremos reutilizar el código sin copiar repositorios, y cada combinación tiene requisitos legales, de idioma y de región de datos distintos.

## Opciones consideradas

1. **Un repositorio por caso (copiar y adaptar):** rápido al principio; las mejoras no se propagan y el código diverge.
2. **Multi-tenant en un solo despliegue:** una base de datos con `tenantId`, como un SaaS. Eficiente a escala, pero mezcla datos de mercados con normativas distintas, complica la región de datos y el borrado, y un error afecta a todos. Excesivo para el volumen actual.
3. **Motor genérico + instancias aisladas por configuración:** un solo código; cada instancia tiene su `instance.yaml` y sus propios proyectos de Firebase. Las diferencias de mercado y destino viven en packs reutilizables.

## Decisión

Opción 3.

- Capas de configuración: pack de mercado → pack de destino → `instance.yaml`, validadas con Zod.
- Una instancia = sus propios proyectos de Firebase (`dev` y `prod`), en la región que exige su mercado.
- El motor no contiene valores de ningún país, mercado o agencia (control en CI).
- Por ahora, las instancias viven en `instances/` dentro de este repositorio privado.

## Consecuencias

- Positivas: una mejora sirve a todas las instancias; aislamiento de datos y cumplimiento por mercado; abrir una instancia nueva es configuración + contenido.
- Negativas: disciplina para no meter valores fijos en el motor; desplegar N instancias requiere automatización en CI; los packs de mercado nuevos necesitan revisión legal.
- Revisar si:
  - Llegan agencias de terceros que no deben ver la configuración de otras → separar `instances/` en repositorios privados por cliente que consumen el motor como paquete o plantilla.
  - Se superan ~10 instancias o se quiere vender como SaaS → reevaluar multi-tenant (opción 2) para la capa de aplicación, manteniendo datos separados por región.
