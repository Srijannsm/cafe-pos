// The product's own identity (as opposed to each cafe's branding, which lives
// in Cafe.themeColor/logoUrl and is applied by lib/theme.ts).
//
// Rule of thumb: tenant-facing screens lead with the CAFE's brand; Aaramva POS
// appears as the app's identity (tab title, favicon, installed app icon), as
// the fallback when a cafe has no logo yet, and as a quiet "Powered by" line.
export const PRODUCT_NAME = "Aaramva POS";
export const PRODUCT_TAGLINE = "Orders, kitchen and billing for cafes and restaurants.";
export const BRAND = { green: "#005538", amber: "#F2A93B" } as const;
