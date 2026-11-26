export interface DraftBannerProps {
  /** `instance.marketPack.landingUi.draftNotice`. */
  text: string;
}

/** Banda de borrador: icono decorativo + aviso del pack de mercado. */
export function DraftBanner({ text }: DraftBannerProps) {
  return (
    <div
      role="status"
      aria-label="draft"
      style={{ textAlign: "center" }}
      className="bg-amber-100 px-4 py-2 text-sm font-medium text-amber-950"
    >
      <span aria-hidden="true">⚠</span> {text}
    </div>
  );
}
