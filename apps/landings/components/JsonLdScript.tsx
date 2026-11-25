import type { Graph } from "schema-dts";
import { serializeJsonLd } from "../lib/structured-data.js";

/**
 * `<script type="application/ld+json">` con el grafo de la landing,
 * serializado con `serializeJsonLd` (escapa `<` contra inyección HTML).
 */
export function JsonLdScript({ graph }: { graph: Graph }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(graph) }} />
  );
}
