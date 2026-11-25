// Turns ONE brand colour (Cafe.themeColor) into the handful of tokens the UI
// needs, and makes sure they stay readable.
//
// Why not just use the hex as-is? A cafe might pick bright yellow -- white
// text on yellow is unreadable. So we measure WCAG contrast and:
//   * pick white or near-black text for on-brand surfaces (whichever reads better)
//   * darken the colour for "strong" uses (text links, hover) until it
//     reaches 4.5:1 against white
//   * mix a very light tint for selected chips/backgrounds.

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: RGB) {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}

function luminance([r, g, b]: RGB) {
  const ch = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

export function contrast(a: RGB, b: RGB) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const WHITE: RGB = [255, 255, 255];
const INK: RGB = [16, 24, 40];

export type BrandPalette = {
  brand: string;
  strong: string;
  tint: string;
  onBrand: string;
  /** Contrast of onBrand text on the brand colour -- shown in settings. */
  contrast: number;
};

export function derivePalette(hex: string): BrandPalette | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const onWhite = contrast(rgb, WHITE);
  const onInk = contrast(rgb, INK);
  const onBrand = onWhite >= 4.5 || onWhite >= onInk ? WHITE : INK;

  // Darken in small steps until text-on-white contrast is comfortable.
  let strong = rgb;
  for (let i = 0; i < 20 && contrast(strong, WHITE) < 4.5; i++) strong = mix(strong, INK, 0.08);
  if (contrast(strong, WHITE) < 4.5) strong = mix(rgb, INK, 0.5);

  return {
    brand: rgbToHex(rgb),
    strong: rgbToHex(strong),
    tint: rgbToHex(mix(rgb, WHITE, 0.9)),
    onBrand: rgbToHex(onBrand),
    contrast: Math.round(Math.max(onWhite, onInk) * 10) / 10,
  };
}

/** Applies the cafe's palette + heading font to the whole document. */
export function applyBrand(themeColor: string | null | undefined, fontStyle?: string | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (fontStyle) root.dataset.font = fontStyle;

  const p = themeColor ? derivePalette(themeColor) : null;
  let el = document.getElementById("cafe-theme") as HTMLStyleElement | null;
  if (!p) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = "cafe-theme";
    document.head.appendChild(el);
  }
  // Set both the raw token and the Tailwind alias (see globals.css for why
  // the aliases need redeclaring alongside the raw values).
  el.textContent = `:root{--brand:${p.brand};--brand-strong:${p.strong};--brand-tint:${p.tint};--on-brand:${p.onBrand};--color-brand:${p.brand};--color-brand-strong:${p.strong};--color-brand-tint:${p.tint};--color-on-brand:${p.onBrand};}`;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", "#ffffff");
}
