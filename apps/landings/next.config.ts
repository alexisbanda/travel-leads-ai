import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La plantilla genera una ruta estática por slug (generateStaticParams +
  // dynamicParams = false); sin páginas dinámicas desconocidas en producción.
  reactStrictMode: true,
};

export default nextConfig;
