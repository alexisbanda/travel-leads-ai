# packages/instance-cli

Comandos `instance:*` del monorepo: `instance:validate`, `instance:build`, `instance:seed` e `instance:landing:generate`.

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

## `instance:landing:generate`

```bash
pnpm instance:landing:generate ec-es amazonia-4d --brief instances/ec-es/content/briefs/amazonia-4d.md
pnpm instance:landing:generate ec-es amazonia-4d --brief <ruta> --from galapagos-y-andes   # ejemplo de estilo
pnpm instance:landing:generate ec-es amazonia-4d --brief <ruta> --model claude-sonnet-5-5 --force
```

Redacta con Claude el borrador de una landing a partir de un brief y lo escribe en `instances/<id>/content/landings/<slug>.json` con `draft: true`, para que una persona lo revise antes de publicar. Es una herramienta del operador: corre en su máquina, con datos del producto y nunca con datos de leads.

- **Brief:** Markdown con front matter YAML (`segment`, `tourIds`, `days`, `priceFrom?`, `ctaType`: `whatsapp` | `form`, `campaignCode?`) y, debajo, los hechos del producto en texto libre. Plantilla: [`instances/_template/content/briefs/_ejemplo.md`](../../instances/_template/content/briefs/_ejemplo.md). Se valida con Zod (estricto) antes de llamar al modelo, y `segment` debe estar en `segments` de la instancia.
- **Antes de llamar al modelo** falla con exit 1 si la instancia no existe o no se resuelve, el slug no es kebab-case o coincide con una página legal, `--from` no existe, el brief es inválido, el pack de mercado no define `contentGuardrails` o el archivo de destino ya existe (salvo `--force`).
- **Qué escribe el modelo:** solo textos (`seo`, `hero` sin medios, `highlights`, `sections`, `itinerary`, `includes`, `bestSeason`, `faq` y `cta.prefill` si `ctaType` es `whatsapp`), en el `locale` del mercado y con su `agentTone`. La CLI impone desde el brief `slug`, `draft: true`, `tourIds`, `segment` y `cta.type`; `priceGuidance.from` solo existe si el brief trae `priceFrom` (y vale exactamente eso); `cta.prefill` termina en `[campaignCode]` si hay código de campaña. `--from <slugBase>` pasa los textos de una landing existente como ejemplo de estilo, sin medios ni precio.
- **Validación (regla 2):** la landing compuesta pasa `validateLandingFiles` (esquema `LandingContent` y colisión con slugs legales), el itinerario tiene exactamente `days` días numerados desde 1 y ningún texto lleva un importe con la moneda del mercado ni una frase de `contentGuardrails.forbiddenClaims` del pack. Si falla, hace un único reintento enviando los errores al modelo; si vuelve a fallar, no escribe nada, lista los errores y sale con 1.
- **Salida:** la ruta escrita, el aviso de `draft: true`, los medios que faltan para publicar (`hero.media` y `gallery`, de 3 a 12 imágenes, en `instances/<id>/content/media`), los tokens de entrada y salida (sumando el reintento) y el coste estimado en USD.
- **Modelo:** `--model <id>`, si no `TLA_LANDING_MODEL` y, si no, `claude-opus-5-5` (`src/landing-generate/config.ts`, junto con la tabla de precios por millón de tokens; un modelo fuera de la tabla muestra «coste no disponible»). Salida estructurada con JSON Schema, pensamiento adaptativo y `effort: medium`.
- **Credenciales:** las del entorno del operador: `ANTHROPIC_API_KEY` o el perfil de `ant auth login`. Nunca en el repositorio ni en `instance.yaml`. Sin credenciales, el comando termina con «sin credenciales: exporta ANTHROPIC_API_KEY o ejecuta ant auth login».

### Evals

```bash
pnpm evals                         # todas las del monorepo
pnpm --filter @tla/instance-cli evals
INSTANCE=ec-es pnpm --filter @tla/instance-cli evals
```

Corren el pipeline real contra la API con los 3 briefs ficticios de `evals/landing-generate/` y escriben en un directorio temporal (nunca en `instances/`). Por brief comprueban: esquema válido, `priceGuidance` solo si el brief trae `priceFrom` y con el mismo valor, `draft: true`, ningún importe con moneda ni frase prohibida y que el idioma sea el del `locale` del mercado. El idioma se comprueba con una heurística de palabras vacías por idioma (subetiqueta de idioma del locale, no país): el idioma del locale debe aportar al menos el 15 % de las palabras y más que cualquier otro idioma de la lista; para un idioma nuevo, añade sus palabras en `STOPWORDS`. La instancia es `INSTANCE` o la primera de `instances/`, y los `segment` de los briefs deben existir en ella. Sin credenciales imprimen `skipped: sin credenciales de Claude (ANTHROPIC_API_KEY o ant auth login)` y salen con 0; con credenciales, cualquier fallo sale con 1.

## Estructura

- `src/load.ts`: carga reutilizable. `listInstanceDirs`, `loadInstance` (YAML → `InstanceConfig`, errores con ruta), `resolvePacks` y `PackRegistry` (`defaultPackRegistry` usa `@tla/markets` y `@tla/destinations`; los tests inyectan uno propio).
- `src/validate.ts`: el comando. `validateInstanceDir`, `formatReport` y `runValidate(argv, options)`, que devuelve el código de salida. Se ejecuta con `tsx src/validate.ts`.
- `src/cli.ts`: utilidades comunes de los comandos (`resolveInstanceById`, `isEntryPoint`, `REPO_ROOT`).
- `src/build.ts`: `runBuild(argv, options)` y `serializeResolved`. Script `instance:build` (no se llama `build` para que `pnpm build` no lo ejecute).
- `src/landing-generate.ts`: `runLandingGenerate(options, deps)` con el cliente del modelo inyectable (`LandingModel`); los tests usan uno simulado y no llaman a la API. Módulos en `src/landing-generate/`: `brief.ts` (front matter), `draft.ts` (contrato del modelo y `assembleLanding`), `guardrails.ts` (regla 2), `prompt.ts`, `model.ts` (cliente de Claude) y `config.ts` (modelo y precios). Evals en `src/landing-generate.evals.ts`.
- `src/seed.ts`: `runSeed(argv, options)`, la interfaz `ConfigWriter` y `firestoreWriterFactory` (`firebase-admin` en una app con nombre propio que se cierra al terminar). Los tests unitarios inyectan un escritor falso; `src/seed.emulator.test.ts` usa el emulador y se salta si no hay `FIRESTORE_EMULATOR_HOST`.

Las reglas cruzadas son funciones puras de `@tla/shared` (`validateInstanceRules`); este paquete solo las conecta con los archivos y los registros de packs. Igual que en el motor, aquí no se escriben valores de país: todo sale de los packs.
