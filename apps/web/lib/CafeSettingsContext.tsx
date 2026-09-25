"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetchJson } from "./api";

interface CafeSettings {
  name: string;
  slug: string;
  logoUrl: string | null;
  themeColor: string | null;
  vatEnabled: boolean;
  vatRate: string;
  panNumber: string | null;
}

interface CafeSettingsContextValue {
  settings: CafeSettings | null;
  loading: boolean;
  refresh: () => void;
}

const CafeSettingsContext = createContext<CafeSettingsContextValue>({
  settings: null,
  loading: true,
  refresh: () => {},
});

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  let r = parseInt(m[1]!.slice(0, 2), 16) / 255;
  let g = parseInt(m[1]!.slice(2, 4), 16) / 255;
  let b = parseInt(m[1]!.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function applyTheme(themeColor: string | null) {
  if (!themeColor) return;
  const hsl = hexToHsl(themeColor);
  if (!hsl) return;
  const { h, s, l } = hsl;
  const root = document.documentElement;
  // brand = the base color
  root.style.setProperty("--color-brand", `oklch(from hsl(${h} ${s}% ${l}%) l c h)`);
  // We set CSS vars using hsl directly since oklch conversion is complex
  root.style.setProperty("--brand-h", `${h}`);
  root.style.setProperty("--brand-s", `${s}%`);
  root.style.setProperty("--brand-l", `${l}%`);
  // Override the actual Tailwind theme tokens via inline style on :root
  // Use a <style> tag approach for broader compatibility
  let styleEl = document.getElementById("cafe-theme") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "cafe-theme";
    document.head.appendChild(styleEl);
  }
  const darkerL = Math.max(l - 8, 10);
  const tintL = Math.min(l + 42, 96);
  const tintS = Math.max(s - 20, 10);
  styleEl.textContent = `
    :root {
      --color-brand: hsl(${h}, ${s}%, ${l}%);
      --color-brand-strong: hsl(${h}, ${s}%, ${darkerL}%);
      --color-brand-tint: hsl(${h}, ${tintS}%, ${tintL}%);
    }
  `;
}

export function CafeSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CafeSettings | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchSettings() {
    try {
      const data = await apiFetchJson<CafeSettings>("/cafes/settings");
      setSettings(data);
      applyTheme(data.themeColor);
    } catch {
      // Not logged in yet, or not admin — skip silently
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSettings();
  }, []);

  return (
    <CafeSettingsContext.Provider value={{ settings, loading, refresh: fetchSettings }}>
      {children}
    </CafeSettingsContext.Provider>
  );
}

export function useCafeSettings() {
  return useContext(CafeSettingsContext);
}

export { API_BASE };
