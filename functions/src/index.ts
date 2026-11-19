// Punto de entrada de Cloud Functions. Ver functions/README.md para el mapa previsto.
import { setGlobalOptions } from "firebase-functions/v2";
import { loadInstanceConfig } from "./config.js";
import { createIngestLandingLeadFunction } from "./http/ingest-landing-lead.js";
import { createMetaLeadWebhookFunction } from "./http/meta-lead-webhook.js";

// La región sale de la configuración resuelta de la instancia
// (`pnpm instance:build <id>`), nunca de constantes.
const config = loadInstanceConfig();
setGlobalOptions({ region: config.infra.region });

// Las funciones se definen después de `setGlobalOptions`: `onRequest` y compañía leen
// las opciones globales en el momento de definirse.
export const metaLeadWebhook = createMetaLeadWebhookFunction();
export const ingestLandingLead = createIngestLandingLeadFunction(config);
