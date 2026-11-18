# packages/instance-cli

Comandos `instance:*` del monorepo. Por ahora, `instance:validate`; `instance:build` e `instance:seed` se añadirán aquí.

```bash
pnpm instance:validate                 # todas las carpetas de instances/ con instance.yaml
pnpm instance:validate ec-es           # solo una
pnpm instance:validate --dir /ruta/a/<id>   # una carpeta fuera de instances/ (relativa = desde la raíz del repo)
```

Salida: `<id>: OK` o `<id>: N errores` con una línea `  [regla] campo: mensaje` por error. Exit 0 si todas son válidas, 1 si alguna falla. Reglas, precedencia y plantillas `_*`: [docs/11 · Validación](../../docs/11-instancias-y-configuracion.md#validación).

## Estructura

- `src/load.ts`: carga reutilizable. `listInstanceDirs`, `loadInstance` (YAML → `InstanceConfig`, errores con ruta), `resolvePacks` y `PackRegistry` (`defaultPackRegistry` usa `@tla/markets` y `@tla/destinations`; los tests inyectan uno propio).
- `src/validate.ts`: el comando. `validateInstanceDir`, `formatReport` y `runValidate(argv, options)`, que devuelve el código de salida. Se ejecuta con `tsx src/validate.ts`.

Las reglas cruzadas son funciones puras de `@tla/shared` (`validateInstanceRules`); este paquete solo las conecta con los archivos y los registros de packs. Igual que en el motor, aquí no se escriben valores de país: todo sale de los packs.
