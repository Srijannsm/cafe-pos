"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { applyBrand } from "./theme";

export interface CafeSettings {
  name: string;
  slug: string;
  logoUrl: string | null;
  themeColor: string | null;
  coverImageUrl: string | null;
  tagline: string | null;
  fontStyle: string;
  menuLayout: string;
  phone: string | null;
  address: string | null;
  wifiName: string | null;
  wifiPassword: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  receiptFooter: string | null;
  vatEnabled: boolean;
  vatRate: string;
  panNumber: string | null;
  pricesIncludeVat: boolean;
  serviceChargeRate: string;
  inventoryEnabled: boolean;
  gamesEnabled: boolean;
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

export function CafeSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CafeSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      // The platform panel and the public QR page brand themselves -- a cafe
      // staff token left in this browser must not recolour them.
      if (/^\/(platform|order\/table)/.test(window.location.pathname)) return;
      const token = localStorage.getItem("accessToken");
      if (!token) return;
      // Plain fetch (not apiFetch) on purpose: a 401 here must not trigger
      // the global logout redirect -- that caused a login-page reload loop.
      const res = await fetch(`${API_BASE}/cafes/settings`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = (await res.json()) as CafeSettings;
      setSettings(data);
      applyBrand(data.themeColor, data.fontStyle);
    } catch {
      // offline -- keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

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
