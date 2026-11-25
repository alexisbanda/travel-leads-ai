import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La plantilla genera una ruta estática por slug (generateStaticParams +
  // dynamicParams = false); sin páginas dinámicas desconocidas en producción.
  reactStrictMode: true,
  // Presupuesto de rendimiento (docs/04-landings.md#rendimiento): formatos
  // modernos para que next/image sirva AVIF o WebP según soporte del navegador.
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // @tla/shared se consume desde sus fuentes TypeScript (condición `source`),
  // igual que en vitest y tsc.
  transpilePackages: ["@tla/shared"],
  webpack: (config) => {
    // Los imports ESM del monorepo usan la extensión `.js` sobre archivos `.ts`.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    config.resolve.conditionNames = ["source", ...(config.resolve.conditionNames ?? ["..."])];
    return config;
  },
};

export default nextConfig;
