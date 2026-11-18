// Punto de entrada de Cloud Functions. Todavía no exporta funciones: el
// scaffolding del motor (webhooks, triggers, scheduler) llega en tickets
// posteriores. Ver functions/README.md para el mapa previsto.
import { setGlobalOptions } from "firebase-functions/v2";
import { loadInstanceConfig } from "./config.js";

// La región sale de la configuración resuelta de la instancia
// (`pnpm instance:build <id>`), nunca de constantes.
const config = loadInstanceConfig();
setGlobalOptions({ region: config.infra.region });
