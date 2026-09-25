import type { Metadata, Viewport } from "next";
import { Manrope, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { CafeSettingsProvider } from "../lib/CafeSettingsContext";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-manrope",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-public-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Cafe POS",
  description: "Cafe POS system",
  manifest: "/manifest.json",
  applicationName: "Cafe POS",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Cafe POS",
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
  themeColor: "#616b57",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} ${publicSans.variable} ${plexMono.variable}`}>
      <body>
        <CafeSettingsProvider>
          {children}
        </CafeSettingsProvider>
      </body>
    </html>
  );
}
