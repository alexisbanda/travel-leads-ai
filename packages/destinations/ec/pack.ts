import { DestinationPack } from "@tla/shared";

/**
 * Pack de destino `ec` (Ecuador): país receptivo.
 *
 * Fuente de la taxonomía de regiones y temporadas: docs/11-instancias-y-configuracion.md.
 *
 * Fuentes oficiales para el mercado `ES`:
 * - Dirección General de Migración de Ecuador (requisitos de entrada al país).
 * - Embajada de España en Ecuador (información y recomendaciones para viajeros
 *   españoles que visitan Ecuador).
 */
export const ec: DestinationPack = DestinationPack.parse({
  country: "EC",
  currency: "USD",
  // Zona horaria por defecto de la agencia receptiva (continente; Galápagos usa
  // America/Guayaquil también para la operación comercial de la agencia).
  timezone: "America/Guayaquil",
  regions: [
    { id: "galapagos", label: "Galápagos" },
    { id: "amazonia", label: "Amazonía" },
    { id: "andes", label: "Andes" },
    { id: "costa", label: "Costa" },
  ],
  seasons: [
    {
      id: "seca-sierra",
      label: "Temporada seca de Sierra y Amazonía",
      months: [6, 7, 8, 9],
      regions: ["andes", "amazonia"],
    },
    {
      id: "humeda-sierra",
      label: "Temporada húmeda de Sierra y Amazonía",
      months: [1, 2, 3, 4, 5, 10, 11, 12],
      regions: ["andes", "amazonia"],
    },
    {
      id: "seca-costa",
      label: "Temporada seca y soleada de Costa",
      months: [1, 2, 3, 4, 5],
      regions: ["costa"],
    },
    {
      id: "humeda-costa",
      label: "Temporada húmeda y nublada de Costa",
      months: [6, 7, 8, 9, 10, 11, 12],
      regions: ["costa"],
    },
    {
      id: "mejor-epoca-galapagos",
      label: "Mejor época para fauna y buceo en Galápagos",
      months: [12, 1, 2, 3, 4, 5],
      regions: ["galapagos"],
    },
  ],
  markets: {
    ES: {
      entryRequirements: [
        {
          label: "Requisitos de entrada a Ecuador — Dirección General de Migración de Ecuador",
          url: "https://www.migracion.gob.ec/",
        },
      ],
      travelAdvice: [
        {
          label: "Embajada de España en Ecuador — información y recomendaciones para viajeros",
          url: "https://www.exteriores.gob.es/Embajadas/quito/es",
        },
      ],
      // Ecuador no tiene decisión de adecuación de protección de datos de la UE.
      adequacyDecision: false,
    },
  },
});
