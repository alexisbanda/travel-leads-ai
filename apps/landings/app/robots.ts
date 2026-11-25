import type { MetadataRoute } from "next";
import { loadLandingsConfig } from "../lib/config.js";
import { buildRobots } from "../lib/seo-index.js";

export default function robots(): MetadataRoute.Robots {
  const { instance } = loadLandingsConfig();
  return buildRobots(instance);
}
