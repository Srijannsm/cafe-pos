// Aaramva POS logo pieces. The mark is inline SVG (not an <img>) so it never
// flashes in late and can be sized with Tailwind classes like any icon.
import { BRAND, PRODUCT_NAME } from "../../lib/brand";

type MarkProps = { className?: string; /** white disc + green A, for green/dark backgrounds */ light?: boolean; title?: string };

/** The two-tone A badge. */
export function BrandMark({ className = "h-8 w-8", light = false, title }: MarkProps) {
  const disc = light ? "#ffffff" : BRAND.green;
  const left = light ? BRAND.green : "#ffffff";
  return (
    <svg viewBox="0 0 100 100" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <circle cx="50" cy="50" r="45" fill={disc} />
      <path d="M34 69 L50 30" fill="none" stroke={left} strokeWidth="8" strokeLinecap="round" />
      <path d="M50 30 L66 69" fill="none" stroke={BRAND.amber} strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

/** Full logo (mark + "aaramva" + POS pill). The wordmark is outlined paths, so no font needed. */
export function BrandLogo({ className = "h-8 w-auto", onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <img src={onDark ? "/brand/aaramva-pos-logo-on-dark.svg" : "/brand/aaramva-pos-logo.svg"} alt={PRODUCT_NAME} className={className} />
  );
}

/** Quiet footer credit for tenant-facing screens. */
export function PoweredBy({ className = "", onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${onDark ? "text-white/50" : "text-ink-faint"} ${className}`}
    >
      <BrandMark className="h-3.5 w-3.5" />
      Powered by <span className={`font-semibold ${onDark ? "text-white/70" : "text-ink-secondary"}`}>{PRODUCT_NAME}</span>
    </span>
  );
}
