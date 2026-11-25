import type { ResolvedInstanceConfig } from "@tla/shared";

/**
 * URL de la Function `ingestLandingLead` a la que envía el formulario de
 * lead. Se calcula en el servidor (build) y llega al cliente como prop.
 * Región y proyecto salen solo de la configuración resuelta.
 */

/** Variables de entorno que usa el cálculo del endpoint. */
export interface LeadEndpointEnv {
  /** Override completo de la URL (p. ej. el emulador de Functions). */
  LEAD_ENDPOINT_URL?: string | undefined;
  /** `prod` usa `infra.firebaseProjects.prod`; cualquier otro valor, `.dev`. */
  TLA_ENV?: string | undefined;
}

/** Nombre de la Function exportada en `functions/src/index.ts`. */
export const LEAD_FUNCTION_NAME = "ingestLandingLead";

type InfraConfig = Pick<ResolvedInstanceConfig, "infra">;

/** Proyecto de Firebase del entorno (`TLA_ENV`), o `undefined` si está vacío. */
export function firebaseProjectId(instance: InfraConfig, env: LeadEndpointEnv): string | undefined {
  const projects = instance.infra.firebaseProjects;
  const project = (env.TLA_ENV === "prod" ? projects.prod : projects.dev).trim();
  return project === "" ? undefined : project;
}

/**
 * Endpoint de ingesta: `LEAD_ENDPOINT_URL` si existe; si no,
 * `https://<infra.region>-<proyecto>.cloudfunctions.net/ingestLandingLead`.
 * `undefined` si falta la región o el proyecto (el formulario no se renderiza).
 */
export function leadEndpointUrl(instance: InfraConfig, env: LeadEndpointEnv): string | undefined {
  const override = env.LEAD_ENDPOINT_URL?.trim();
  if (override) return override;
  const region = instance.infra.region.trim();
  const project = firebaseProjectId(instance, env);
  if (region === "" || project === undefined) return undefined;
  return `https://${region}-${project}.cloudfunctions.net/${LEAD_FUNCTION_NAME}`;
}
