"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { platformFetchJson } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/Button";
import { Drawer } from "../../../components/ui/Drawer";
import { Switch } from "../../../components/ui/Switch";
import { Tabs } from "../../../components/ui/Tabs";
import { Field, Panel, inputClass } from "../../../components/ui/Field";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Skeleton } from "../../../components/ui/Skeleton";
import { IconPlus, IconSearch, IconStore, IconCheckCircle, IconExternal } from "../../../components/icons";
import { CafeAvatar, PLAN_KEYS, StatusPill, loginUrl, usePlans, type Plan, type SubStatus } from "../../../components/platform/shared";
import { ago, rs, shortDate } from "../../../lib/format";

type CafeRow = {
  id: number; name: string; slug: string; isActive: boolean; logoUrl: string | null; themeColor: string | null;
  plan: Plan; billingCycle: string; subscriptionStatus: SubStatus; nextBillingAt: string | null; createdAt: string;
  trialDaysLeft: number | null; orders30: number; gmv30: string; lastOrderAt: string | null; mrr: number; atRisk: boolean;
  _count: { users: number; orders: number; tables: number; menuItems: number };
};
type View = "all" | "trial" | "active" | "overdue" | "renewals" | "atrisk" | "inactive";

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function CafesPage() {
  const router = useRouter();
  const { showToast, toastHost } = useToast();
  const [rows, setRows] = useState<CafeRow[] | null>(null);
  const [view, setView] = useState<View>("all");
  const [q, setQ] = useState("");
  const [onboard, setOnboard] = useState(false);
  const pl = usePlans();

  const load = useCallback(() => platformFetchJson<CafeRow[]>("/platform/cafes").then(setRows).catch((e) => showToast(e.message, "error")), [showToast]);
  useEffect(() => {
    load();
    const p = new URLSearchParams(window.location.search);
    if (p.get("new") === "1") setOnboard(true);
    const v = p.get("view") as View | null;
    if (v) setView(v);
  }, [load]);

  const in7d = (d: string | null) => !!d && new Date(d).getTime() - Date.now() < 7 * 86400000;
  const match: Record<View, (c: CafeRow) => boolean> = {
    all: () => true,
    trial: (c) => c.isActive && c.subscriptionStatus === "trial",
    active: (c) => c.isActive && c.subscriptionStatus === "active",
    overdue: (c) => c.isActive && c.subscriptionStatus === "overdue",
    renewals: (c) => c.isActive && c.subscriptionStatus === "active" && in7d(c.nextBillingAt),
    atrisk: (c) => c.atRisk,
    inactive: (c) => !c.isActive || c.subscriptionStatus === "cancelled",
  };
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter(match[view]).filter((c) => !s || c.name.toLowerCase().includes(s) || c.slug.includes(s));
  }, [rows, view, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (v: View) => (rows ?? []).filter(match[v]).length;

  function changeView(v: View) {
    setView(v);
    window.history.replaceState(null, "", v === "all" ? "/platform/cafes" : `/platform/cafes?view=${v}`);
  }

  return (
    <div>
      {toastHost}
      <PageHeader title="Cafes" description={rows ? `${rows.length} cafes on the platform` : " "} actions={<Button icon={<IconPlus />} onClick={() => setOnboard(true)}>Onboard cafe</Button>} />

      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle p-4">
          <Tabs
            value={view}
            onChange={changeView}
            tabs={[
              { value: "all", label: "All", count: count("all") },
              { value: "trial", label: "Trial", count: count("trial") },
              { value: "active", label: "Paying", count: count("active") },
              { value: "overdue", label: "Overdue", count: count("overdue") },
              { value: "renewals", label: "Renew this week", count: count("renewals") },
              { value: "atrisk", label: "Gone quiet", count: count("atrisk") },
              { value: "inactive", label: "Off", count: count("inactive") },
            ]}
          />
          <div className="relative ml-auto w-full sm:w-64">
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input className={`${inputClass} w-full pl-10`} placeholder="Search name or slug…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {!rows ? (
          <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : shown.length === 0 ? (
          <EmptyState icon={<IconStore className="h-6 w-6" />} title={rows.length ? "No cafes here" : "No cafes yet"} description={rows.length ? "Try another tab or search." : "Onboard the first one — it takes a minute."} className="py-14" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-3">Cafe</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="hidden px-4 py-3 text-right md:table-cell">Orders · 30d</th>
                  <th className="hidden px-4 py-3 text-right lg:table-cell">Through till · 30d</th>
                  <th className="hidden px-4 py-3 xl:table-cell">Last order</th>
                  <th className="hidden px-4 py-3 md:table-cell">Next bill</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} onClick={() => router.push(`/platform/cafes/${c.id}`)} className={`cursor-pointer border-b border-border-subtle last:border-0 hover:bg-surface-canvas ${c.isActive ? "" : "opacity-60"}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <CafeAvatar name={c.name} logoUrl={c.logoUrl} color={c.themeColor} size={36} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink-primary">{c.name}</p>
                          <p className="truncate text-xs text-ink-faint">/c/{c.slug} · {c._count.users} staff · {c._count.tables} tables</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{pl.name(c.plan)}</p>
                      <p className="text-xs text-ink-faint">{rs(pl.cyclePrice(c.plan, c.billingCycle))}/{c.billingCycle === "yearly" ? "yr" : "mo"}</p>
                    </td>
                    <td className="px-4 py-3"><StatusPill status={c.subscriptionStatus} isActive={c.isActive} trialDaysLeft={c.trialDaysLeft} /></td>
                    <td className="tabular hidden px-4 py-3 text-right md:table-cell">{c.orders30}</td>
                    <td className="tabular hidden px-4 py-3 text-right lg:table-cell">{rs(c.gmv30)}</td>
                    <td className={`hidden px-4 py-3 xl:table-cell ${c.atRisk ? "text-status-warning-ink" : "text-ink-secondary"}`}>{c.lastOrderAt ? ago(c.lastOrderAt) : "Never"}</td>
                    <td className={`hidden px-4 py-3 md:table-cell ${in7d(c.nextBillingAt) ? "font-medium text-status-warning-ink" : "text-ink-secondary"}`}>{c.nextBillingAt ? shortDate(c.nextBillingAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <OnboardDrawer
        open={onboard}
        onClose={() => { setOnboard(false); window.history.replaceState(null, "", "/platform/cafes"); }}
        onCreated={() => load()}
        onError={(m) => showToast(m, "error")}
      />
    </div>
  );
}

function OnboardDrawer({ open, onClose, onCreated, onError }: { open: boolean; onClose: () => void; onCreated: () => void; onError: (m: string) => void }) {
  const empty = { name: "", slug: "", slugTouched: false, adminName: "", adminPin: "", plan: "standard" as Plan, billingCycle: "monthly", startTrial: true, vatEnabled: false, panNumber: "" };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const pl = usePlans();
  const [created, setCreated] = useState<{ id: number; name: string; slug: string; pin: string; admin: string } | null>(null);
  useEffect(() => { if (open) { setF(empty); setCreated(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = f.name.trim() && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug) && f.adminName.trim() && /^\d{4}$/.test(f.adminPin);

  async function submit() {
    if (!valid) return;
    setBusy(true);
    try {
      const res = await platformFetchJson<{ id: number; name: string; slug: string }>("/platform/cafes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name, slug: f.slug, adminName: f.adminName, adminPin: f.adminPin, plan: f.plan, billingCycle: f.billingCycle,
          startTrial: f.startTrial, vatEnabled: f.vatEnabled, vatRate: f.vatEnabled ? 13 : undefined, panNumber: f.vatEnabled ? f.panNumber || null : undefined,
        }),
      });
      setCreated({ id: res.id, name: res.name, slug: res.slug, pin: f.adminPin, admin: f.adminName });
      onCreated();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const welcome = created
    ? `Welcome to Cafe POS, ${created.name}! 🎉\n\nStaff login: ${loginUrl(created.slug)}\nAdmin: ${created.admin}\nPIN: ${created.pin}\n\nStart in Admin → Menu, then Tables & QR to print your table QR codes.`
    : "";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={created ? "Cafe is ready" : "Onboard a cafe"}
      subtitle={created ? created.name : "Creates the cafe and its first admin in one step."}
      footer={created ? (
        <>
          <Button variant="secondary" onClick={() => { setF(empty); setCreated(null); }}>Onboard another</Button>
          <Link href={`/platform/cafes/${created.id}`}><Button>Open cafe</Button></Link>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!valid} onClick={submit}>Create cafe</Button>
        </>
      )}
    >
      {created ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-xl bg-status-success-tint p-4 text-status-success-ink">
            <IconCheckCircle className="h-6 w-6 shrink-0" />
            <p className="text-sm font-medium">Created. Send the owner these details — the PIN isn&apos;t shown again.</p>
          </div>
          <pre className="whitespace-pre-wrap rounded-xl border border-border-subtle bg-surface-canvas p-4 font-body text-sm">{welcome}</pre>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(welcome)}>Copy message</Button>
            <a href={`https://wa.me/?text=${encodeURIComponent(welcome)}`} target="_blank" rel="noreferrer"><Button variant="secondary" icon={<IconExternal />}>Share on WhatsApp</Button></a>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Cafe</p>
            <Field label="Cafe name">
              <input autoFocus className={`${inputClass} w-full`} value={f.name} placeholder="Himalayan Brew" onChange={(e) => setF({ ...f, name: e.target.value, slug: f.slugTouched ? f.slug : slugify(e.target.value) })} />
            </Field>
            <Field label="Login address" hint={f.slug ? `Staff sign in at ${loginUrl(f.slug)}` : "Lowercase letters, numbers and hyphens"}>
              <div className="flex items-center rounded-lg border border-border-strong shadow-sm focus-within:border-brand">
                <span className="pl-3.5 text-sm text-ink-faint">/c/</span>
                <input className="min-h-11 w-full bg-transparent px-1 text-sm outline-none" value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value), slugTouched: true })} />
              </div>
            </Field>
          </section>
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">First admin (owner)</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name"><input className={`${inputClass} w-full`} value={f.adminName} onChange={(e) => setF({ ...f, adminName: e.target.value })} placeholder="Owner's name" /></Field>
              <Field label="4-digit PIN">
                <input className={`${inputClass} tabular w-full tracking-[0.5em]`} inputMode="numeric" maxLength={4} value={f.adminPin} onChange={(e) => setF({ ...f, adminPin: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
              </Field>
            </div>
            <button type="button" className="text-sm font-medium text-brand-strong" onClick={() => setF({ ...f, adminPin: String(Math.floor(1000 + Math.random() * 9000)) })}>Generate a PIN</button>
          </section>
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Plan</p>
            <div className="grid grid-cols-3 gap-2">
              {PLAN_KEYS.map((p) => (
                <button key={p} type="button" onClick={() => setF({ ...f, plan: p })} className={`rounded-xl border p-3 text-left ${f.plan === p ? "border-brand bg-brand-tint" : "border-border-subtle"}`}>
                  <p className="text-sm font-semibold">{pl.name(p)}</p>
                  <p className="tabular text-xs text-ink-secondary">{rs(pl.monthly(p))}/mo</p>
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-lg bg-surface-sunken p-0.5">
              {[["monthly", "Monthly"], ["yearly", "Yearly"]].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setF({ ...f, billingCycle: v! })} className={`rounded-md px-3 py-1.5 text-sm font-medium ${f.billingCycle === v ? "bg-surface-raised shadow-sm" : "text-ink-secondary"}`}>{l}</button>
              ))}
            </div>
            <Switch checked={f.startTrial} onChange={(v) => setF({ ...f, startTrial: v })} label="Start with a 14-day free trial" description="Off = they've already paid; billing starts today." />
            <Switch checked={f.vatEnabled} onChange={(v) => setF({ ...f, vatEnabled: v })} label="VAT registered" description="Adds 13% VAT and the PAN to their bills. They can change it later." />
            {f.vatEnabled && <Field label="PAN / VAT number"><input className={`${inputClass} w-full`} value={f.panNumber} onChange={(e) => setF({ ...f, panNumber: e.target.value })} /></Field>}
          </section>
        </div>
      )}
    </Drawer>
  );
}
