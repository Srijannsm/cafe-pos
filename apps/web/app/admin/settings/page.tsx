"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, apiFetchJson } from "../../../lib/api";
import { useCafeSettings } from "../../../lib/CafeSettingsContext";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Skeleton } from "../../../components/ui/Skeleton";
import { Button } from "../../../components/ui/Button";
import { SectionCard } from "../_components/SectionCard";

// ── icons ──────────────────────────────────────────────────────────────────────
function IconSettings({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function IconImage({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function IconPalette({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
    </svg>
  );
}
function IconTrash({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

// ── types ──────────────────────────────────────────────────────────────────────
type CafeSettings = {
  name: string;
  slug: string;
  logoUrl: string | null;
  themeColor: string | null;
  vatEnabled: boolean;
  vatRate: string;
  panNumber: string | null;
};

// ── preset theme palette ───────────────────────────────────────────────────────
const PALETTE = [
  { label: "Espresso",   hex: "#3b1f0e" },
  { label: "Rust",       hex: "#c0440e" },
  { label: "Amber",      hex: "#d97706" },
  { label: "Olive",      hex: "#5a7a2b" },
  { label: "Teal",       hex: "#0d7377" },
  { label: "Navy",       hex: "#1e3a5f" },
  { label: "Plum",       hex: "#6b2d8b" },
  { label: "Rose",       hex: "#be185d" },
  { label: "Slate",      hex: "#475569" },
  { label: "Charcoal",   hex: "#1f2937" },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ── helpers ───────────────────────────────────────────────────────────────────
function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-lg text-sm font-semibold text-white transition-all ${ok ? "bg-green-600" : "bg-red-600"}`}>
      {ok ? "✓" : "✕"} {msg}
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { refresh: refreshCafeSettings } = useCafeSettings();
  const [settings, setSettings] = useState<CafeSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // General settings form
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Theme
  const [themeColor, setThemeColor] = useState<string>("#3b1f0e");
  const [savingTheme, setSavingTheme] = useState(false);
  const [customHex, setCustomHex] = useState("");

  // Logo
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  // Load settings
  useEffect(() => {
    apiFetchJson<CafeSettings>("/cafes/settings")
      .then((s) => {
        setSettings(s);
        setName(s.name);
        const color = s.themeColor ?? "#3b1f0e";
        setThemeColor(color);
        setCustomHex(color);
        setLogoPreview(s.logoUrl ? `${API_BASE}${s.logoUrl}` : null);
      })
      .catch(() => showToast("Failed to load settings", false))
      .finally(() => setLoading(false));
  }, []);

  // ── save name ───────────────────────────────────────────────────────────────
  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingName(true);
    try {
      const updated = await apiFetchJson<CafeSettings>("/cafes/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      setSettings((s) => s ? { ...s, name: updated.name } : s);
      showToast("Cafe name saved"); refreshCafeSettings();
    } catch {
      showToast("Failed to save name", false);
    } finally {
      setSavingName(false);
    }
  }

  // ── save theme ──────────────────────────────────────────────────────────────
  async function saveTheme() {
    const hex = /^#[0-9A-Fa-f]{6}$/.test(customHex) ? customHex : themeColor;
    setSavingTheme(true);
    try {
      await apiFetchJson("/cafes/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeColor: hex }),
      });
      setSettings((s) => s ? { ...s, themeColor: hex } : s);
      setThemeColor(hex);
      showToast("Theme color saved"); refreshCafeSettings();
    } catch {
      showToast("Failed to save theme color", false);
    } finally {
      setSavingTheme(false);
    }
  }

  // ── upload logo ─────────────────────────────────────────────────────────────
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("Logo must be under 2 MB", false);
      return;
    }
    const url = URL.createObjectURL(file);
    setLogoPreview(url);
    uploadLogo(file);
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true);
    const form = new FormData();
    form.append("logo", file);
    try {
      const res = await apiFetch("/cafes/settings/logo", { method: "POST", body: form });
      const data = (await res.json()) as { logoUrl: string };
      setLogoPreview(`${API_BASE}${data.logoUrl}`);
      setSettings((s) => s ? { ...s, logoUrl: data.logoUrl } : s);
      showToast("Logo uploaded"); refreshCafeSettings();
    } catch {
      showToast("Logo upload failed", false);
      setLogoPreview(settings?.logoUrl ? `${API_BASE}${settings.logoUrl}` : null);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function removeLogo() {
    setRemovingLogo(true);
    try {
      await apiFetch("/cafes/settings/logo", { method: "DELETE" });
      setLogoPreview(null);
      setSettings((s) => s ? { ...s, logoUrl: null } : s);
      if (fileRef.current) fileRef.current.value = "";
      showToast("Logo removed"); refreshCafeSettings();
    } catch {
      showToast("Failed to remove logo", false);
    } finally {
      setRemovingLogo(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="App Settings" description="Customize your cafe's branding and appearance." />
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-52 w-full rounded-xl" />
      </div>
    );
  }

  const activeHex = /^#[0-9A-Fa-f]{6}$/.test(customHex) ? customHex : themeColor;

  return (
    <div className="space-y-6">
      <PageHeader title="App Settings" description="Customize your cafe's branding and appearance." />

      {/* ── General ─────────────────────────────────────────────────────── */}
      <SectionCard icon={<IconSettings />} title="General" description="Your cafe's display name shown across the app.">
        <form onSubmit={saveName} className="flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-semibold text-ink-faint uppercase tracking-widest">Cafe name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Matta Café"
              className="w-full rounded-lg border border-border-strong bg-white px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <Button type="submit" loading={savingName} disabled={!name.trim() || name === settings?.name}>
            Save
          </Button>
        </form>
        <p className="mt-3 text-xs text-ink-faint">Slug (URL identifier): <span className="font-mono font-medium text-ink-secondary">{settings?.slug}</span> — contact platform admin to change.</p>
      </SectionCard>

      {/* ── Logo ────────────────────────────────────────────────────────── */}
      <SectionCard icon={<IconImage />} title="Logo" description="Upload your cafe's logo. Shown in the sidebar and on receipts. Max 2 MB, PNG or JPG.">
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          {/* Preview */}
          <div className="flex-shrink-0">
            <div className="h-28 w-28 rounded-2xl border-2 border-dashed border-border-strong bg-surface-sunken flex items-center justify-center overflow-hidden">
              {uploadingLogo ? (
                <svg className="h-6 w-6 animate-spin text-ink-faint" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              ) : logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPreview} alt="Logo" className="h-full w-full object-contain p-2" />
              ) : (
                <IconImage className="h-10 w-10 text-ink-faint" />
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-3">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
            <Button
              variant="secondary"
              icon={<IconImage />}
              onClick={() => fileRef.current?.click()}
              loading={uploadingLogo}
            >
              {logoPreview ? "Replace logo" : "Upload logo"}
            </Button>
            {logoPreview && (
              <Button
                variant="danger"
                size="small"
                icon={<IconTrash />}
                onClick={removeLogo}
                loading={removingLogo}
              >
                Remove logo
              </Button>
            )}
            <p className="text-xs text-ink-faint">PNG or JPG · square recommended · max 2 MB</p>
          </div>
        </div>
      </SectionCard>

      {/* ── Theme Color ─────────────────────────────────────────────────── */}
      <SectionCard icon={<IconPalette />} title="Theme Color" description="Pick your brand color. This sets the accent color across the app.">
        {/* Live preview bar */}
        <div
          className="mb-5 flex items-center gap-3 rounded-xl px-5 py-3"
          style={{ backgroundColor: activeHex + "18", borderLeft: `4px solid ${activeHex}` }}
        >
          <div className="h-8 w-8 rounded-full shadow-sm" style={{ backgroundColor: activeHex }} />
          <div>
            <p className="text-sm font-bold" style={{ color: activeHex }}>Preview</p>
            <p className="text-xs text-ink-faint">This is how your brand color looks</p>
          </div>
          <div className="ml-auto text-xs font-mono font-semibold text-ink-secondary">{activeHex.toUpperCase()}</div>
        </div>

        {/* Palette swatches */}
        <p className="text-xs font-semibold text-ink-faint uppercase tracking-widest mb-3">Presets</p>
        <div className="flex flex-wrap gap-3 mb-5">
          {PALETTE.map((p) => (
            <button
              key={p.hex}
              type="button"
              title={p.label}
              onClick={() => { setThemeColor(p.hex); setCustomHex(p.hex); }}
              className="group relative flex flex-col items-center gap-1"
            >
              <span
                className={`h-9 w-9 rounded-full shadow transition-transform group-hover:scale-110 ${themeColor === p.hex ? "ring-2 ring-offset-2 scale-110" : ""}`}
                style={{ backgroundColor: p.hex, ringColor: p.hex }}
              />
              <span className="text-[10px] text-ink-faint">{p.label}</span>
            </button>
          ))}
        </div>

        {/* Custom hex input */}
        <div className="flex gap-3 items-center mb-5">
          <div className="flex items-center gap-2 flex-1 rounded-lg border border-border-strong bg-white px-3 py-2">
            <input
              type="color"
              value={activeHex}
              onChange={(e) => { setCustomHex(e.target.value); setThemeColor(e.target.value); }}
              className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
              title="Pick custom color"
            />
            <span className="text-ink-faint text-sm">Custom:</span>
            <input
              type="text"
              value={customHex}
              onChange={(e) => {
                setCustomHex(e.target.value);
                if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) setThemeColor(e.target.value);
              }}
              placeholder="#rrggbb"
              className="flex-1 bg-transparent text-sm font-mono text-ink-primary focus:outline-none"
              maxLength={7}
            />
          </div>
        </div>

        <Button onClick={saveTheme} loading={savingTheme}>
          Apply theme color
        </Button>

        <p className="mt-3 text-xs text-ink-faint">
          Currently saved: <span className="font-mono font-medium" style={{ color: settings?.themeColor ?? "#3b1f0e" }}>{settings?.themeColor ?? "default"}</span>
        </p>
      </SectionCard>

      {/* Toast */}
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
}
