# packages/instance-cli

Comandos `instance:*` del monorepo: `instance:validate`, `instance:build` e `instance:seed`.

```bash
pnpm instance:validate                 # todas las carpetas de instances/ con instance.yaml
pnpm instance:validate ec-es           # solo una
pnpm instance:validate --dir /ruta/a/<id>   # una carpeta fuera de instances/ (relativa = desde la raíz del repo)
```

Salida: `<id>: OK` o `<id>: N errores` con una línea `  [regla] campo: mensaje` por error. Exit 0 si todas son válidas, 1 si alguna falla. Reglas, precedencia y plantillas `_*`: [docs/11 · Validación](../../docs/11-instancias-y-configuracion.md#validación).

## `instance:build`

```bash
pnpm instance:build ec-es                       # escribe generated/instance.json en la raíz
pnpm instance:build ec-es --out /tmp/ec-es.json # otra ruta (relativa = desde donde se lanza)
```

Carga la instancia, aplica las mismas reglas que `instance:validate` y la resuelve con `resolveInstance` de `@tla/shared`. Si hay errores, los lista con el mismo formato (`  [regla] campo: mensaje`), sale con 1 y no escribe nada. Las plantillas `_*` y los ids inexistentes también salen con 1. La salida es determinista: claves ordenadas recursivamente, 2 espacios, `\n` final y sin marcas de tiempo.

## `instance:seed`

```bash
pnpm instance:seed ec-es local   # emulador (FIRESTORE_EMULATOR_HOST o 127.0.0.1:8080), proyecto dev de la instancia
pnpm instance:seed ec-es dev     # proyecto dev real con ADC (gcloud auth application-default login)
pnpm test:emulator               # tests de integración con firebase emulators:exec (proyecto demo-tla-seed)
```

Resuelve la instancia en memoria (no lee `generated/`), construye los documentos con `buildConfigDocs` y los escribe con `set(data, { merge: true })` en `config/sla`, `config/agents` y `config/flags`: idempotente y sin borrar campos ajenos. `prod` sale con 1 antes de crear ningún cliente, y también se niega si el proyecto final coincide con `infra.firebaseProjects.prod`. `dev` se niega si `FIRESTORE_EMULATOR_HOST` está definida. Salida: `<id> (<env>, <projectId>): config/sla, config/agents, config/flags: 3 documentos escritos`.

## Estructura

- `src/load.ts`: carga reutilizable. `listInstanceDirs`, `loadInstance` (YAML → `InstanceConfig`, errores con ruta), `resolvePacks` y `PackRegistry` (`defaultPackRegistry` usa `@tla/markets` y `@tla/destinations`; los tests inyectan uno propio).
- `src/validate.ts`: el comando. `validateInstanceDir`, `formatReport` y `runValidate(argv, options)`, que devuelve el código de salida. Se ejecuta con `tsx src/validate.ts`.
- `src/cli.ts`: utilidades comunes de los comandos (`resolveInstanceById`, `isEntryPoint`, `REPO_ROOT`).
- `src/build.ts`: `runBuild(argv, options)` y `serializeResolved`. Script `instance:build` (no se llama `build` para que `pnpm build` no lo ejecute).
- `src/seed.ts`: `runSeed(argv, options)`, la interfaz `ConfigWriter` y `firestoreWriterFactory` (`firebase-admin` en una app con nombre propio que se cierra al terminar). Los tests unitarios inyectan un escritor falso; `src/seed.emulator.test.ts` usa el emulador y se salta si no hay `FIRESTORE_EMULATOR_HOST`.

Las reglas cruzadas son funciones puras de `@tla/shared` (`validateInstanceRules`); este paquete solo las conecta con los archivos y los registros de packs. Igual que en el motor, aquí no se escriben valores de país: todo sale de los packs.
