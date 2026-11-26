import type { Metadata, Viewport } from "next";
import { Outfit, Fraunces, Poppins } from "next/font/google";
import "./globals.css";
import { CafeSettingsProvider } from "../lib/CafeSettingsContext";

// Outfit is the app font (same as Aaramva Shikshya). Fraunces / Poppins are
// only used for headings on customer-facing screens when a cafe picks the
// "warm" or "playful" vibe, so they aren't preloaded.
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-outfit",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-fraunces",
  preload: false,
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-poppins",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Aaramva POS", template: "%s · Aaramva POS" },
  description: "Aaramva POS — orders, kitchen and billing for cafes and restaurants.",
  manifest: "/manifest.json",
  applicationName: "Aaramva POS",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Aaramva POS",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable} ${poppins.variable}`}>
      <body>
        <CafeSettingsProvider>
          {children}
        </CafeSettingsProvider>
      </body>
    </html>
  );
}
