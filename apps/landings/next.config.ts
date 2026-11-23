import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La plantilla genera una ruta estática por slug (generateStaticParams +
  // dynamicParams = false); sin páginas dinámicas desconocidas en producción.
  reactStrictMode: true,
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
