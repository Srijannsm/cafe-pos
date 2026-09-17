import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cafe POS",
  description: "Cafe POS system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
