"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import { useCafeSettings, type CafeSettings } from "../../../lib/CafeSettingsContext";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/Button";
import { Tabs } from "../../../components/ui/Tabs";
import { Switch } from "../../../components/ui/Switch";
import { Field, Panel, Pill, SectionTitle, inputClass } from "../../../components/ui/Field";
import { Skeleton } from "../../../components/ui/Skeleton";
import { IconUpload, IconX, IconWifi, IconPhone } from "../../../components/icons";
import { derivePalette, applyBrand } from "../../../lib/theme";
import { assetUrl, rs } from "../../../lib/format";
import { uploadImage } from "../../../lib/upload";
import { useImageCropper } from "../../../components/ui/ImageCropper";
import { prepareImage } from "../../../lib/image";

type Tab = "brand" | "billing" | "features";
const SWATCHES = ["#1a8055", "#6f4e37", "#c2410c", "#b91c1c", "#be185d", "#7c3aed", "#2563eb", "#0e7490", "#111827", "#ca8a04"];
const FONTS = [
  { value: "modern", label: "Modern", sample: "font-[family-name:var(--font-outfit)]" },
  { value: "warm", label: "Warm", sample: "font-[family-name:var(--font-fraunces)]" },
  { value: "playful", label: "Playful", sample: "font-[family-name:var(--font-poppins)]" },
];

// Sample dishes for the customer-menu preview.
const PREVIEW_ITEMS: [string, number, string][] = [
  ["Iced Latte", 280, "Double shot over ice"],
  ["Chicken Momo", 220, "Steamed, with tomato achar"],
  ["French Toast", 240, "Honey and seasonal fruit"],
];

export default function SettingsPage() {
  const { showToast, toastHost } = useToast();
  const { crop, cropDialog } = useImageCropper();
  const { settings, refresh } = useCafeSettings();
  const [tab, setTab] = useState<Tab>("brand");
  const [f, setF] = useState<CafeSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyImg, setBusyImg] = useState<"logo" | "cover" | null>(null);
  const [planFeatures, setPlanFeatures] = useState<{ inventory: boolean; tableGame: boolean } | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings && !f) setF(settings);
  }, [settings, f]);
  useEffect(() => {
    apiFetchJson<{ features: { inventory: boolean; tableGame: boolean } }>("/cafes/my-plan").then((p) => setPlanFeatures(p.features)).catch(() => {});
  }, []);

  if (!f) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full rounded-2xl" /></div>;

  const set = <K extends keyof CafeSettings>(k: K, v: CafeSettings[K]) => setF((x) => (x ? { ...x, [k]: v } : x));
  const palette = derivePalette(f.themeColor ?? "#1a8055");

  async function save(partial?: Partial<CafeSettings>) {
    if (!f) return;
    setSaving(true);
    try {
      const body = partial ?? {
        name: f.name, themeColor: f.themeColor ?? undefined, tagline: f.tagline ?? "", fontStyle: f.fontStyle, menuLayout: f.menuLayout,
        phone: f.phone ?? "", address: f.address ?? "", wifiName: f.wifiName ?? "", wifiPassword: f.wifiPassword ?? "",
        instagram: f.instagram ?? "", facebook: f.facebook ?? "", tiktok: f.tiktok ?? "", receiptFooter: f.receiptFooter ?? "",
        vatEnabled: f.vatEnabled, vatRate: Number(f.vatRate), panNumber: f.panNumber ?? "", pricesIncludeVat: f.pricesIncludeVat,
        serviceChargeRate: Number(f.serviceChargeRate), inventoryEnabled: f.inventoryEnabled, gamesEnabled: f.gamesEnabled,
      };
      await apiFetchJson("/cafes/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      refresh();
      showToast("Settings saved");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function onLogo(file?: File) {
    if (!file) return;
    try {
      const area = await crop(file, { aspect: 1, round: true, title: "Crop your logo", hint: "Shown in a circle or rounded square across the app and on receipts." });
      if (!area) return;
      setBusyImg("logo");
      const blob = await prepareImage(file, { aspect: 1, maxWidth: 512, crop: area });
      const form = new FormData();
      form.append("logo", blob, blob.type === "image/webp" ? "logo.webp" : "logo.jpg");
      const res = await apiFetchJson<{ logoUrl: string }>("/cafes/settings/logo", { method: "POST", body: form });
      set("logoUrl", res.logoUrl);
      refresh();
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusyImg(null);
    }
  }

  async function onCover(file?: File) {
    if (!file) return;
    try {
      const area = await crop(file, { aspect: 16 / 9, title: "Crop cover photo", hint: "The banner at the top of your QR menu and staff login screen." });
      if (!area) return;
      setBusyImg("cover");
      const url = await uploadImage(file, "cover", 16 / 9, 1600, area);
      set("coverImageUrl", url);
      await save({ coverImageUrl: url });
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusyImg(null);
    }
  }

  const exampleNet = 1000;
  const sc = (exampleNet * Number(f.serviceChargeRate || 0)) / 100;
  const vatRate = Number(f.vatRate || 13);
  const vat = f.vatEnabled ? (f.pricesIncludeVat ? ((exampleNet + sc) * vatRate) / (100 + vatRate) : ((exampleNet + sc) * vatRate) / 100) : 0;
  const total = exampleNet + sc + (f.vatEnabled && !f.pricesIncludeVat ? vat : 0);

  return (
    <div>
      {toastHost}
      {cropDialog}
      <PageHeader title="Settings" description="Your cafe's look, billing rules and features." actions={tab !== "features" ? <Button loading={saving} onClick={() => save()}>Save changes</Button> : undefined} />
      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[{ value: "brand", label: "Cafe & vibe" }, { value: "billing", label: "Billing & tax" }, { value: "features", label: "Features" }]} />

      {tab === "brand" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <Panel>
              <SectionTitle title="Identity" description="Shown on the staff app, receipts and the customer QR menu." />
              <div className="flex flex-wrap items-center gap-5">
                <div className="relative">
                  {assetUrl(f.logoUrl) ? (
                    <img src={assetUrl(f.logoUrl)!} alt="Logo" className="h-20 w-20 rounded-2xl border border-border-subtle object-cover" />
                  ) : (
                    <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand text-2xl font-semibold text-on-brand">{f.name.charAt(0)}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="small" icon={<IconUpload />} loading={busyImg === "logo"} onClick={() => logoRef.current?.click()}>Upload logo</Button>
                  {f.logoUrl && <Button variant="ghost" size="small" onClick={async () => { await apiFetchJson("/cafes/settings/logo", { method: "DELETE" }); set("logoUrl", null); refresh(); }}>Remove</Button>}
                </div>
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Cafe name"><input className={`${inputClass} w-full`} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
                <Field label="Tagline" hint="One line under your name on the QR menu"><input className={`${inputClass} w-full`} maxLength={120} value={f.tagline ?? ""} onChange={(e) => set("tagline", e.target.value)} placeholder="Slow coffee, fast Wi-Fi" /></Field>
                <Field label="Phone"><input className={`${inputClass} w-full`} value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
                <Field label="Address"><input className={`${inputClass} w-full`} value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="Lakeside, Pokhara" /></Field>
              </div>
            </Panel>

            <Panel>
              <SectionTitle title="Colour & feel" description="One colour drives buttons and highlights. We check it stays readable." />
              <div className="flex flex-wrap items-center gap-2">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" aria-label={c} onClick={() => { set("themeColor", c); applyBrand(c, f.fontStyle); }} className={`h-9 w-9 rounded-full ring-offset-2 transition ${f.themeColor === c ? "ring-2 ring-ink-primary" : ""}`} style={{ background: c }} />
                ))}
                <label className="ml-2 flex items-center gap-2 rounded-lg border border-border-strong px-2 py-1.5">
                  <input type="color" value={f.themeColor ?? "#1a8055"} onChange={(e) => { set("themeColor", e.target.value); applyBrand(e.target.value, f.fontStyle); }} className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
                  <span className="tabular text-sm text-ink-secondary">{f.themeColor ?? "#1a8055"}</span>
                </label>
              </div>
              {palette && (
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                  <span className="rounded-lg px-3 py-1.5 font-medium" style={{ background: palette.brand, color: palette.onBrand }}>Button</span>
                  <span className="rounded-lg px-3 py-1.5 font-medium" style={{ background: palette.tint, color: palette.strong }}>Selected</span>
                  <span className="font-medium" style={{ color: palette.strong }}>Link text</span>
                  {palette.contrast >= 4.5 ? <Pill tone="success">Readable · {palette.contrast}:1</Pill> : <Pill tone="warning">Low contrast · {palette.contrast}:1 — we&apos;ll use dark text</Pill>}
                </div>
              )}
              <p className="mb-2 mt-6 text-sm font-medium text-ink-primary">Heading font (customer menu)</p>
              <div className="grid grid-cols-3 gap-3">
                {FONTS.map((x) => (
                  <button key={x.value} type="button" onClick={() => { set("fontStyle", x.value); applyBrand(f.themeColor, x.value); }} className={`rounded-xl border p-3 text-left transition ${f.fontStyle === x.value ? "border-brand bg-brand-tint" : "border-border-subtle hover:border-border-strong"}`}>
                    <span className={`block text-xl font-semibold text-ink-primary ${x.sample}`}>Aa Cafe</span>
                    <span className="text-xs text-ink-secondary">{x.label}</span>
                  </button>
                ))}
              </div>
              <p className="mb-2 mt-6 text-sm font-medium text-ink-primary">Menu layout</p>
              <div className="inline-flex rounded-lg bg-surface-sunken p-0.5">
                {[["grid", "Photo grid"], ["list", "Compact list"]].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => set("menuLayout", v!)} className={`rounded-md px-4 py-2 text-sm font-medium ${f.menuLayout === v ? "bg-surface-raised shadow-sm" : "text-ink-secondary"}`}>{l}</button>
                ))}
              </div>
            </Panel>

            <Panel>
              <SectionTitle title="Cover photo" description="The big image at the top of your QR menu. Landscape, 16:9." />
              <div className="relative aspect-[16/9] max-w-lg overflow-hidden rounded-xl border border-dashed border-border-strong bg-surface-canvas">
                {assetUrl(f.coverImageUrl) ? (
                  <>
                    <img src={assetUrl(f.coverImageUrl)!} alt="" className="h-full w-full object-cover" />
                    <button type="button" aria-label="Remove cover" onClick={() => { set("coverImageUrl", null); save({ coverImageUrl: null }); }} className="absolute right-2 top-2 rounded-lg bg-white/90 p-1.5 shadow-sm"><IconX className="h-4 w-4" /></button>
                  </>
                ) : (
                  <button type="button" onClick={() => coverRef.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-ink-secondary">
                    <IconUpload className="h-5 w-5" />{busyImg === "cover" ? "Uploading…" : "Upload cover photo"}
                  </button>
                )}
              </div>
              <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={(e) => onCover(e.target.files?.[0])} />
            </Panel>

            <Panel>
              <SectionTitle title="Guest info" description="Shown on the QR menu and receipt footer." />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Wi-Fi name"><input className={`${inputClass} w-full`} value={f.wifiName ?? ""} onChange={(e) => set("wifiName", e.target.value)} /></Field>
                <Field label="Wi-Fi password"><input className={`${inputClass} w-full`} value={f.wifiPassword ?? ""} onChange={(e) => set("wifiPassword", e.target.value)} /></Field>
                <Field label="Instagram" hint="Handle, e.g. mitthocafe"><input className={`${inputClass} w-full`} value={f.instagram ?? ""} onChange={(e) => set("instagram", e.target.value.replace(/^@/, ""))} /></Field>
                <Field label="Facebook page"><input className={`${inputClass} w-full`} value={f.facebook ?? ""} onChange={(e) => set("facebook", e.target.value)} /></Field>
                <Field label="TikTok"><input className={`${inputClass} w-full`} value={f.tiktok ?? ""} onChange={(e) => set("tiktok", e.target.value.replace(/^@/, ""))} /></Field>
                <Field label="Receipt footer"><input className={`${inputClass} w-full`} maxLength={160} value={f.receiptFooter ?? ""} onChange={(e) => set("receiptFooter", e.target.value)} placeholder="Thank you — see you again!" /></Field>
              </div>
            </Panel>
          </div>

          {/* Live preview of the QR menu header */}
          <div className="xl:sticky xl:top-24 xl:self-start">
            <p className="mb-2 text-sm font-medium text-ink-secondary">Customer menu preview</p>
            <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[28px] border-[6px] border-ink-primary bg-surface-canvas shadow-lg">
              <div className="relative h-36 bg-surface-sunken">
                {assetUrl(f.coverImageUrl) && <img src={assetUrl(f.coverImageUrl)!} alt="" className="h-full w-full object-cover" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-3 left-3 flex items-center gap-2.5 text-white">
                  {assetUrl(f.logoUrl) ? <img src={assetUrl(f.logoUrl)!} alt="" className="h-11 w-11 rounded-xl border-2 border-white object-cover" /> : <span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-white text-lg font-semibold" style={{ background: palette?.brand }}>{f.name.charAt(0)}</span>}
                  <div>
                    <p className="font-display text-lg font-semibold leading-tight">{f.name}</p>
                    {f.tagline && <p className="text-xs text-white/80">{f.tagline}</p>}
                  </div>
                </div>
              </div>
              <div className="space-y-3 p-3">
                <div className="flex gap-2 text-xs">
                  {["Popular", "Coffee", "Momo"].map((c, i) => <span key={c} className="rounded-full px-3 py-1.5 font-medium" style={i === 0 ? { background: palette?.brand, color: palette?.onBrand } : { background: "var(--surface-raised)", border: "1px solid var(--border-subtle)" }}>{c}</span>)}
                </div>
                {/* Mirrors the two layouts the QR page draws (order/table/[qrToken]). */}
                {f.menuLayout === "list" ? (
                  <div className="rounded-xl bg-surface-raised px-3">
                    {PREVIEW_ITEMS.map(([n, p, d]) => (
                      <div key={n} className="flex gap-3 border-b border-border-subtle py-3 last:border-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium">{n}</p>
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-secondary">{d}</p>
                          <p className="tabular mt-1 text-xs font-semibold">{rs(p)}</p>
                        </div>
                        <div className="h-12 w-12 shrink-0 rounded-lg bg-surface-sunken" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {PREVIEW_ITEMS.slice(0, 2).map(([n, p]) => (
                      <div key={n} className="overflow-hidden rounded-xl border border-border-subtle bg-surface-raised">
                        <div className="aspect-[4/3] bg-surface-sunken" />
                        <div className="p-2"><p className="text-xs font-medium">{n}</p><p className="tabular text-xs text-ink-secondary">{rs(p)}</p></div>
                      </div>
                    ))}
                  </div>
                )}
                {(f.wifiName || f.phone) && (
                  <div className="flex gap-3 rounded-xl bg-surface-raised p-2.5 text-[11px] text-ink-secondary">
                    {f.wifiName && <span className="flex items-center gap-1"><IconWifi className="h-3.5 w-3.5" />{f.wifiName}</span>}
                    {f.phone && <span className="flex items-center gap-1"><IconPhone className="h-3.5 w-3.5" />{f.phone}</span>}
                  </div>
                )}
                <div className="rounded-xl py-2.5 text-center text-sm font-semibold" style={{ background: palette?.brand, color: palette?.onBrand }}>View order · 2 items</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "billing" && (
        <div className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_340px]">
          <Panel>
            <div className="space-y-6">
              <Switch checked={f.vatEnabled} onChange={(v) => set("vatEnabled", v)} label="VAT registered" description="Adds VAT and prints your PAN/VAT number on bills." />
              {f.vatEnabled && (
                <div className="grid gap-4 border-l-2 border-border-subtle pl-4 sm:grid-cols-2">
                  <Field label="VAT rate (%)"><input className={`${inputClass} w-full tabular`} inputMode="decimal" value={f.vatRate} onChange={(e) => set("vatRate", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
                  <Field label="PAN / VAT number"><input className={`${inputClass} w-full`} value={f.panNumber ?? ""} onChange={(e) => set("panNumber", e.target.value)} /></Field>
                  <div className="sm:col-span-2">
                    <Switch checked={f.pricesIncludeVat} onChange={(v) => set("pricesIncludeVat", v)} label="Menu prices already include VAT" description="Recommended. Customers pay exactly the menu price; VAT is shown inside it on the bill." />
                  </div>
                </div>
              )}
              <div>
                <Field label="Service charge (%)" hint="Leave at 0 unless your accountant advises otherwise — its legal status in Nepal has been contested.">
                  <input className={`${inputClass} tabular w-32`} inputMode="decimal" value={f.serviceChargeRate} onChange={(e) => set("serviceChargeRate", e.target.value.replace(/[^\d.]/g, ""))} />
                </Field>
              </div>
            </div>
          </Panel>
          <Panel>
            <p className="mb-3 text-sm font-medium">Example bill</p>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between text-ink-secondary"><dt>Items</dt><dd className="tabular">{rs(exampleNet)}</dd></div>
              {sc > 0 && <div className="flex justify-between text-ink-secondary"><dt>Service charge {f.serviceChargeRate}%</dt><dd className="tabular">{rs(sc)}</dd></div>}
              {f.vatEnabled && <div className="flex justify-between text-ink-secondary"><dt>VAT {vatRate}%{f.pricesIncludeVat ? " (included)" : ""}</dt><dd className="tabular">{rs(vat, { decimals: true })}</dd></div>}
              <div className="flex justify-between border-t border-border-subtle pt-2 font-semibold"><dt>Customer pays</dt><dd className="tabular">{rs(total, { decimals: true })}</dd></div>
            </dl>
          </Panel>
        </div>
      )}

      {tab === "features" && (
        <Panel className="max-w-3xl">
          <div className="space-y-6">
            {[
              { key: "inventoryEnabled" as const, plan: planFeatures?.inventory, label: "Inventory", description: "Track raw materials, hookah supplies and glassware; deduct ingredients via recipes." },
              { key: "gamesEnabled" as const, plan: planFeatures?.tableGame, label: "Play while you wait", description: "After ordering from the table QR, customers can play quick tic-tac-toe with their own table — or challenge another table. No chat, only emoji reactions." },
            ].map((x, i) => (
              <div key={x.key} className={i ? "border-t border-border-subtle pt-6" : ""}>
                <Switch
                  checked={!!f[x.key] && x.plan !== false}
                  disabled={x.plan === false}
                  onChange={(v) => { set(x.key, v); save({ [x.key]: v }); }}
                  label={x.label}
                  description={x.description}
                />
                {x.plan === false && <p className="mt-2 text-sm text-status-warning-ink">Not included in your plan — see <a href="/admin/plan" className="font-medium underline">Plan</a> to compare.</p>}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
