import type { MetadataRoute } from "next";
import { loadLandingsConfig } from "../lib/config.js";
import { isUnpublishable } from "../lib/seo-index.js";
import { siteUrl } from "../lib/structured-data.js";

export default function robots(): MetadataRoute.Robots {
  const { instance } = loadLandingsConfig();
  if (isUnpublishable(instance)) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteUrl(instance)}/sitemap.xml`,
  };
}
