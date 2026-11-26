import type { CSSProperties, ReactNode } from "react";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { DraftBanner } from "../components/DraftBanner.js";
import { Footer } from "../components/Footer.js";
import { Header } from "../components/Header.js";
import { loadLandingsConfig } from "../lib/config.js";
import { defaultMediaDir } from "../lib/media.js";
import { buildFooterView, buildHeaderView } from "../lib/view.js";

// Tipografías de la plantilla (sin textos ni datos de mercado): títulos con
// carácter y texto legible. Se sirven desde el propio sitio (next/font).
const displayFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
  variable: "--font-display-family",
});
const bodyFont = Inter({ subsets: ["latin"], display: "swap", variable: "--font-body-family" });

export default function RootLayout({ children }: { children: ReactNode }) {
  const { instance, isDraft } = loadLandingsConfig();

  // Color de marca de la instancia para las utilidades `*-brand` (globals.css).
  const brandStyle = instance.brand.primaryColor
    ? ({ "--brand-primary": instance.brand.primaryColor } as CSSProperties)
    : undefined;

  const header = buildHeaderView(instance, {
    media: { mediaDir: defaultMediaDir(instance.id), isDraft },
  });
  const footer = buildFooterView(instance);

  return (
    <html
      lang={instance.market.locale}
      style={brandStyle}
      className={`${displayFont.variable} ${bodyFont.variable}`}
    >
      <head>{isDraft ? <meta name="robots" content="noindex" /> : null}</head>
      <body>
        {isDraft ? <DraftBanner text={instance.marketPack.landingUi.draftNotice} /> : null}
        <Header {...header} />
        {children}
        <Footer {...footer} />
      </body>
    </html>
  );
}
