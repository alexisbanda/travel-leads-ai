import type { CSSProperties, ReactNode } from "react";
import "./globals.css";
import { loadLandingsConfig } from "../lib/config.js";

export default function RootLayout({ children }: { children: ReactNode }) {
  const { instance, isDraft } = loadLandingsConfig();

  // Color de marca de la instancia para las utilidades `*-brand` (globals.css).
  const brandStyle = instance.brand.primaryColor
    ? ({ "--brand-primary": instance.brand.primaryColor } as CSSProperties)
    : undefined;

  return (
    <html lang={instance.market.locale} style={brandStyle}>
      <head>{isDraft ? <meta name="robots" content="noindex" /> : null}</head>
      <body>
        {isDraft ? (
          <div role="status" aria-label="draft" style={{ textAlign: "center" }}>
            ⚠
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
