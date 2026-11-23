import type { ReactNode } from "react";
import { loadLandingsConfig } from "../lib/config.js";

export default function RootLayout({ children }: { children: ReactNode }) {
  const { instance, isDraft } = loadLandingsConfig();

  return (
    <html lang={instance.market.locale}>
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
