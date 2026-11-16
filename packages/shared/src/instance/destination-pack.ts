import { z } from "zod";
import {
  CountryCode,
  CurrencyCode,
  duplicates,
  HttpsUrl,
  Month,
  NonEmptyText,
  Slug,
  TimeZone,
} from "./primitives.js";

/** Región turística del destino; los tours se clasifican por su `id`. */
export const DestinationRegion = z
  .object({
    id: Slug,
    label: NonEmptyText,
  })
  .strict();
export type DestinationRegion = z.infer<typeof DestinationRegion>;

/** Temporada del destino, opcionalmente limitada a algunas regiones. */
export const DestinationSeason = z
  .object({
    id: Slug,
    label: NonEmptyText,
    months: z
      .array(Month)
      .min(1, { message: "indica al menos un mes" })
      .refine((months) => new Set(months).size === months.length, {
        message: "hay meses repetidos",
      }),
    /** Ids de `regions` a los que aplica. Si se omite, aplica a todo el destino. */
    regions: z.array(Slug).min(1).optional(),
  })
  .strict();
export type DestinationSeason = z.infer<typeof DestinationSeason>;

/** Fuente oficial enlazable (organismo público del mercado o del destino). */
export const OfficialSource = z
  .object({
    label: NonEmptyText,
    url: HttpsUrl,
  })
  .strict();
export type OfficialSource = z.infer<typeof OfficialSource>;

/** Información del destino que depende del mercado emisor. */
export const DestinationMarketInfo = z
  .object({
    /** Fuentes oficiales de requisitos de entrada para viajeros de ese mercado. */
    entryRequirements: z
      .array(OfficialSource)
      .min(1, { message: "indica al menos una fuente oficial de requisitos de entrada" }),
    /** Fuentes oficiales de avisos de viaje del mercado sobre el destino. */
    travelAdvice: z
      .array(OfficialSource)
      .min(1, { message: "indica al menos una fuente oficial de avisos de viaje" }),
    /** Si el destino tiene decisión de adecuación de protección de datos para ese mercado. */
    adequacyDecision: z.boolean(),
  })
  .strict();
export type DestinationMarketInfo = z.infer<typeof DestinationMarketInfo>;

/** Pack de destino (`packages/destinations/<iso>`): lo que depende del país receptor. */
export const DestinationPack = z
  .object({
    /** País de destino. */
    country: CountryCode,
    /** Moneda local del destino. */
    currency: CurrencyCode,
    /** Zona horaria por defecto de la agencia receptiva. */
    timezone: TimeZone,
    /** Taxonomía de regiones turísticas. */
    regions: z
      .array(DestinationRegion)
      .min(1, { message: "indica al menos una región del destino" }),
    /** Temporadas. */
    seasons: z.array(DestinationSeason),
    /** Información por mercado emisor; la clave es el código de país del mercado. */
    markets: z
      .record(CountryCode, DestinationMarketInfo)
      .refine((markets) => Object.keys(markets).length > 0, {
        message: "indica al menos un mercado emisor",
      }),
  })
  .strict()
  .superRefine((pack, ctx) => {
    const regionIds = pack.regions.map((region) => region.id);
    for (const id of duplicates(regionIds)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["regions"],
        message: `id de región repetido: ${id}`,
      });
    }
    for (const id of duplicates(pack.seasons.map((season) => season.id))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["seasons"],
        message: `id de temporada repetido: ${id}`,
      });
    }
    const known = new Set(regionIds);
    pack.seasons.forEach((season, index) => {
      season.regions?.forEach((regionId, regionIndex) => {
        if (!known.has(regionId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["seasons", index, "regions", regionIndex],
            message: `región desconocida: ${regionId} no está en regions`,
          });
        }
      });
    });
  });
export type DestinationPack = z.infer<typeof DestinationPack>;
