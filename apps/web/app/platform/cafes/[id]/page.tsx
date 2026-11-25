"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { platformFetchJson } from "../../../../lib/api";
import { useToast } from "../../../../components/Toast";
import { Button } from "../../../../components/ui/Button";
import { Modal } from "../../../../components/ui/Modal";
import { Switch } from "../../../../components/ui/Switch";
import { Tabs } from "../../../../components/ui/Tabs";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { Field, Panel, Pill, SectionTitle, inputClass } from "../../../../components/ui/Field";
import { StatCard } from "../../../../components/ui/StatCard";
import { Skeleton } from "../../../../components/ui/Skeleton";
import { ErrorState } from "../../../../components/ui/ErrorState";
import { BarChart } from "../../../../components/admin/charts";
import { IconChevronLeft, IconExternal, IconCheck, IconBanknote, IconReceipt, IconQrCode, IconClock, IconKey } from "../../../../components/icons";
import { CafeAvatar, PLAN_KEYS, StatusPill, loginUrl, usePlans, type Plan, type SubStatus } from "../../../../components/platform/shared";
import { ago, dateTime, localDay, rs, shortDate } from "../../../../lib/format";

type Detail = {
  id: number; name: string; slug: string; isActive: boolean; logoUrl: string | null; themeColor: string | null;
  vatEnabled: boolean; vatRate: string; panNumber: string | null; phone: string | null; address: string | null;
  plan: Plan; billingCycle: string; subscriptionStatus: SubStatus; trialStartedAt: string; trialEndsAt: string; trialDaysLeft: number | null;
  nextBillingAt: string | null; setupFeePaid: boolean; subscriptionNotes: string | null; createdAt: string;
  inventoryEnabled: boolean; gamesEnabled: boolean;
  orders30: number; gmv30: string; lastOrderAt: string | null; mrr: number; atRisk: boolean; qrOrders30: number;
  _count: { users: number; orders: number; tables: number; menuItems: number };
  users: { id: number; name: string; role: string; isActive: boolean }[];
  recentOrders: { id: number; status: string; total: string | null; createdAt: string; source: string; table: { tableNumber: string } | null }[];
  series: { period: string; sales: string; bills: number }[];
};
type Tab = "overview" | "subscription" | "staff" | "settings";
const json = { "Content-Type": "application/json" };

export default function CafeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { showToast, toastHost } = useToast();
  const [c, setC] = useState<Detail | null>(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [payOpen, setPayOpen] = useState(false);
  const [pinFor, setPinFor] = useState<Detail["users"][number] | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const pl = usePlans();

  const load = useCallback(() => platformFetchJson<Detail>(`/platform/cafes/${id}`).then(setC).catch(() => setErr(true)), [id]);
  useEffect(() => { load(); }, [load]);

  async function patch(body: Record<string, unknown>, ok = "Saved") {
    try {
      await platformFetchJson(`/platform/cafes/${id}`, { method: "PATCH", headers: json, body: JSON.stringify(body) });
      showToast(ok);
      load();
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  if (err) return <ErrorState title="Couldn't load this cafe" onRetry={load} />;
  if (!c) return <div className="space-y-4"><Skeleton className="h-16 w-80 rounded-xl" /><Skeleton className="h-80 rounded-2xl" /></div>;

  const checklist = [
    { done: c._count.menuItems > 0, label: "Menu added", detail: `${c._count.menuItems} items` },
    { done: c._count.tables > 0, label: "Tables set up", detail: `${c._count.tables} tables` },
    { done: c.users.filter((u) => u.isActive).length > 1, label: "Staff invited", detail: `${c.users.length} accounts` },
    { done: c._count.orders > 0, label: "First order taken", detail: c.lastOrderAt ? `last ${ago(c.lastOrderAt)}` : "not yet" },
    { done: c.qrOrders30 > 0, label: "Customers using QR", detail: `${c.qrOrders30} QR orders · 30d` },
  ];

  return (
    <div>
      {toastHost}
      <Link href="/platform/cafes" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink-primary"><IconChevronLeft className="h-4 w-4" />All cafes</Link>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <CafeAvatar name={c.name} logoUrl={c.logoUrl} color={c.themeColor} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{c.name}</h1>
            <StatusPill status={c.subscriptionStatus} isActive={c.isActive} trialDaysLeft={c.trialDaysLeft} />
            {c.atRisk && <Pill tone="warning">Gone quiet</Pill>}
          </div>
          <p className="text-sm text-ink-secondary">
            {pl.name(c.plan)} · {c.billingCycle} · joined {shortDate(c.createdAt)}{c.address ? ` · ${c.address}` : ""}{c.phone ? ` · ${c.phone}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="small" onClick={() => { navigator.clipboard?.writeText(loginUrl(c.slug)); showToast("Login link copied"); }}>Copy login link</Button>
          <a href={loginUrl(c.slug)} target="_blank" rel="noreferrer"><Button variant="secondary" size="small" icon={<IconExternal />}>Open</Button></a>
          <Button size="small" icon={<IconBanknote />} onClick={() => setPayOpen(true)}>Record payment</Button>
        </div>
      </div>

      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[
        { value: "overview", label: "Overview" }, { value: "subscription", label: "Subscription" },
        { value: "staff", label: "Staff", count: c.users.length }, { value: "settings", label: "Settings" },
      ]} />

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard icon={<IconReceipt />} label="Paid orders · 30 days" value={c.orders30} caption={`${c._count.orders.toLocaleString("en-IN")} all-time`} />
            <StatCard icon={<IconBanknote />} label="Through their till · 30 days" value={rs(c.gmv30)} caption={c.orders30 ? `avg ${rs(Number(c.gmv30) / c.orders30)}` : undefined} />
            <StatCard icon={<IconQrCode />} label="QR self-orders · 30 days" value={c.qrOrders30} />
            <StatCard icon={<IconClock />} label="Last order" value={c.lastOrderAt ? ago(c.lastOrderAt) : "Never"} captionTone={c.atRisk ? "warning" : undefined} caption={c.atRisk ? "Worth a call" : undefined} />
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <Panel className="xl:col-span-2">
              <SectionTitle title="Sales, last 30 days" description="What went through their POS — not what they pay us." />
              <BarChart height={180} data={c.series.map((s) => ({ label: s.period, value: Number(s.sales), sub: `${s.bills} bills` }))} />
            </Panel>
            <Panel>
              <SectionTitle title="Setup checklist" description="Help them finish onboarding." />
              <ul className="space-y-3">
                {checklist.map((s) => (
                  <li key={s.label} className="flex items-center gap-3 text-sm">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-status-success text-white" : "border-2 border-border-strong"}`}>{s.done && <IconCheck className="h-3.5 w-3.5" />}</span>
                    <span className={`flex-1 ${s.done ? "text-ink-primary" : "text-ink-secondary"}`}>{s.label}</span>
                    <span className="text-xs text-ink-faint">{s.detail}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
          <Panel padded={false}>
            <div className="px-6 pb-3 pt-5"><h3 className="text-base font-semibold">Recent orders</h3></div>
            {c.recentOrders.length === 0 ? <p className="px-6 pb-6 text-sm text-ink-faint">No orders yet.</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {c.recentOrders.map((o) => (
                    <tr key={o.id} className="border-t border-border-subtle">
                      <td className="px-6 py-3 font-medium">#{o.id}</td>
                      <td className="px-3 py-3 text-ink-secondary">Table {o.table?.tableNumber ?? "—"}{o.source === "qr" ? " · QR" : ""}</td>
                      <td className="px-3 py-3"><Pill tone={o.status === "paid" ? "success" : o.status === "cancelled" ? "danger" : "info"}>{o.status}</Pill></td>
                      <td className="tabular px-3 py-3 text-right">{o.total ? rs(o.total) : "—"}</td>
                      <td className="px-6 py-3 text-right text-ink-faint">{dateTime(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      )}

      {tab === "subscription" && <SubscriptionTab c={c} patch={patch} onPay={() => setPayOpen(true)} reload={load} toast={showToast} />}

      {tab === "staff" && (
        <Panel padded={false} className="max-w-3xl">
          <ul className="divide-y divide-border-subtle">
            {c.users.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-6 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken text-sm font-semibold">{u.name.charAt(0)}</span>
                <div className="flex-1">
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs capitalize text-ink-faint">{u.role}{u.isActive ? "" : " · deactivated"}</p>
                </div>
                <Button size="small" variant="secondary" icon={<IconKey />} onClick={() => setPinFor(u)}>Reset PIN</Button>
              </li>
            ))}
          </ul>
          <p className="border-t border-border-subtle px-6 py-3 text-xs text-ink-faint">Day-to-day staff changes are done by the cafe in Admin → Staff. Reset a PIN here when the owner is locked out.</p>
        </Panel>
      )}

      {tab === "settings" && (
        <div className="max-w-3xl space-y-6">
          <SettingsPanel c={c} patch={patch} />
          <Panel>
            <SectionTitle title={c.isActive ? "Deactivate cafe" : "Reactivate cafe"} description={c.isActive ? "Staff can't log in and the QR menu stops working. Data is kept." : "Staff can log in again."} />
            {c.isActive
              ? <Button variant="danger" onClick={() => setConfirmOff(true)}>Deactivate</Button>
              : <Button onClick={() => patch({ isActive: true }, "Cafe reactivated")}>Reactivate</Button>}
          </Panel>
        </div>
      )}

      <PaymentModal open={payOpen} c={c} onClose={() => setPayOpen(false)} onDone={() => { setPayOpen(false); showToast("Payment recorded — subscription extended"); load(); }} onError={(m) => showToast(m, "error")} />
      <PinModal user={pinFor} cafeId={c.id} onClose={() => setPinFor(null)} onDone={(m) => { setPinFor(null); showToast(m); load(); }} onError={(m) => showToast(m, "error")} />
      <ConfirmDialog open={confirmOff} title={`Deactivate ${c.name}?`} description="Their staff will be signed out of new sessions and the QR menu will show an error. You can reactivate any time." confirmLabel="Deactivate" onCancel={() => setConfirmOff(false)} onConfirm={() => { setConfirmOff(false); patch({ isActive: false }, "Cafe deactivated"); }} />
    </div>
  );
}

function SubscriptionTab({ c, patch, onPay, reload, toast }: { c: Detail; patch: (b: Record<string, unknown>, ok?: string) => void; onPay: () => void; reload: () => void; toast: (m: string, t?: "success" | "error") => void }) {
  const [f, setF] = useState({ plan: c.plan, billingCycle: c.billingCycle, subscriptionStatus: c.subscriptionStatus, nextBillingAt: c.nextBillingAt?.slice(0, 10) ?? "", setupFeePaid: c.setupFeePaid });
  const [note, setNote] = useState("");
  const pl = usePlans();
  const due = pl.cyclePrice(f.plan, f.billingCycle);

  async function extend(days: number) {
    try {
      await platformFetchJson(`/platform/cafes/${c.id}/extend-trial`, { method: "POST", headers: json, body: JSON.stringify({ days }) });
      toast(`Trial extended by ${days} days`);
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Panel>
        <SectionTitle title="Plan & billing" description="Collected manually (eSewa / Khalti / bank). Record each payment so the due date moves forward." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan">
            <select className={`${inputClass} w-full`} value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value as Plan })}>
              {PLAN_KEYS.map((p) => <option key={p} value={p}>{pl.name(p)} — {rs(pl.monthly(p))}/mo</option>)}
            </select>
          </Field>
          <Field label="Billing cycle">
            <select className={`${inputClass} w-full`} value={f.billingCycle} onChange={(e) => setF({ ...f, billingCycle: e.target.value })}>
              <option value="monthly">Monthly</option><option value="yearly">Yearly</option>
            </select>
          </Field>
          <Field label="Status" hint={f.subscriptionStatus === "overdue" ? "Overdue = read-only: they can't start orders or add items." : undefined}>
            <select className={`${inputClass} w-full`} value={f.subscriptionStatus} onChange={(e) => setF({ ...f, subscriptionStatus: e.target.value as SubStatus })}>
              <option value="trial">Trial</option><option value="active">Active</option><option value="overdue">Overdue</option><option value="cancelled">Cancelled</option>
            </select>
          </Field>
          <Field label="Next bill due">
            <input type="date" className={`${inputClass} w-full`} value={f.nextBillingAt} onChange={(e) => setF({ ...f, nextBillingAt: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4"><Switch checked={f.setupFeePaid} onChange={(v) => setF({ ...f, setupFeePaid: v })} label="Setup fee paid" description="One-time onboarding fee, if you charged one." /></div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <p className="text-sm text-ink-secondary">Each {f.billingCycle === "yearly" ? "year" : "month"}: <span className="tabular font-semibold text-ink-primary">{rs(due)}</span></p>
          <Button onClick={() => patch({ ...f, nextBillingAt: f.nextBillingAt || null }, "Subscription updated")}>Save</Button>
        </div>
      </Panel>

      <div className="space-y-6">
        {c.subscriptionStatus === "trial" && (
          <Panel>
            <SectionTitle title="Trial" description={`Ends ${shortDate(c.trialEndsAt)}${c.trialDaysLeft != null ? ` (${c.trialDaysLeft > 0 ? `${c.trialDaysLeft} days left` : "ended"})` : ""}`} />
            <div className="flex flex-wrap gap-2">
              {[7, 14].map((d) => <Button key={d} size="small" variant="secondary" onClick={() => extend(d)}>+{d} days</Button>)}
              <Button size="small" onClick={onPay}>Convert to paid</Button>
            </div>
          </Panel>
        )}
        <Panel>
          <SectionTitle title="Payment log" action={<Button size="small" variant="secondary" onClick={onPay}>+ Payment</Button>} />
          {c.subscriptionNotes ? (
            <ul className="space-y-2 text-sm">
              {c.subscriptionNotes.split("\n").filter(Boolean).map((l, i) => <li key={i} className="rounded-lg bg-surface-canvas px-3 py-2 text-ink-secondary">{l}</li>)}
            </ul>
          ) : <p className="text-sm text-ink-faint">No payments recorded yet.</p>}
          <div className="mt-4 flex gap-2">
            <input className={`${inputClass} w-full`} placeholder="Add a note (call, promise to pay…)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button variant="secondary" disabled={!note.trim()} onClick={() => { patch({ subscriptionNotes: [`${localDay()} · ${note.trim()}`, c.subscriptionNotes].filter(Boolean).join("\n") }, "Note added"); setNote(""); }}>Add</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SettingsPanel({ c, patch }: { c: Detail; patch: (b: Record<string, unknown>, ok?: string) => void }) {
  const pl = usePlans();
  const plan = pl.plans?.find((p) => p.key === (c.subscriptionStatus === "trial" ? "premium" : c.plan));
  const notInPlan = (on: boolean | undefined) => (plan && !on ? <p className="mt-1.5 text-xs text-status-warning-ink">Not in the {plan.name} plan — stays off for this cafe until they upgrade (or you add it in Plans).</p> : null);
  const [name, setName] = useState(c.name);
  const [vat, setVat] = useState({ vatEnabled: c.vatEnabled, vatRate: String(Number(c.vatRate)), panNumber: c.panNumber ?? "" });
  return (
    <>
      <Panel>
        <SectionTitle title="Cafe" />
        <div className="flex gap-2">
          <input className={`${inputClass} w-full`} value={name} onChange={(e) => setName(e.target.value)} />
          <Button variant="secondary" disabled={!name.trim() || name === c.name} onClick={() => patch({ name }, "Name updated")}>Save</Button>
        </div>
        <p className="mt-2 text-xs text-ink-faint">Login address /c/{c.slug} can&apos;t change — printed QR codes and saved logins depend on it.</p>
      </Panel>
      <Panel>
        <SectionTitle title="VAT" description="The cafe can also change this in its own Settings." />
        <Switch checked={vat.vatEnabled} onChange={(v) => setVat({ ...vat, vatEnabled: v })} label="VAT registered" description="Adds VAT and the PAN to their bills." />
        {vat.vatEnabled && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Rate (%)"><input className={`${inputClass} tabular w-full`} value={vat.vatRate} onChange={(e) => setVat({ ...vat, vatRate: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
            <Field label="PAN / VAT no."><input className={`${inputClass} w-full`} value={vat.panNumber} onChange={(e) => setVat({ ...vat, panNumber: e.target.value })} /></Field>
          </div>
        )}
        <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={() => patch({ vatEnabled: vat.vatEnabled, vatRate: Number(vat.vatRate || 13), panNumber: vat.panNumber || null }, "VAT updated")}>Save VAT</Button></div>
      </Panel>
      <Panel>
        <SectionTitle title="Features" />
        <div className="space-y-5">
          <Switch checked={c.inventoryEnabled} onChange={(v) => patch({ inventoryEnabled: v }, v ? "Inventory on" : "Inventory off")} label="Inventory" description="Stock items, purchases, recipes." />
          {notInPlan(plan?.inventory)}
          <Switch checked={c.gamesEnabled} onChange={(v) => patch({ gamesEnabled: v }, v ? "Table game on" : "Table game off")} label="Play while you wait" description="Tic-tac-toe on the customer QR page." />
          {notInPlan(plan?.tableGame)}
        </div>
      </Panel>
    </>
  );
}

function PaymentModal({ open, c, onClose, onDone, onError }: { open: boolean; c: Detail; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const pl = usePlans();
  const due = pl.cyclePrice(c.plan, c.billingCycle);
  const [amount, setAmount] = useState(String(due));
  const [method, setMethod] = useState("eSewa");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setAmount(String(due)); setReference(""); } }, [open, due]);
  async function go() {
    setBusy(true);
    try {
      await platformFetchJson(`/platform/cafes/${c.id}/payments`, { method: "POST", headers: json, body: JSON.stringify({ amount: Number(amount), method, reference: reference || undefined }) });
      onDone();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Record subscription payment" size="sm">
      <p className="mb-4 text-sm text-ink-secondary">{pl.name(c.plan)} · {c.billingCycle}. Marks the cafe active and moves the due date one {c.billingCycle === "yearly" ? "year" : "month"} forward.</p>
      <div className="space-y-4">
        <Field label="Amount (Rs)"><input className={`${inputClass} tabular w-full text-lg`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
        <Field label="Paid via">
          <div className="grid grid-cols-4 gap-2">
            {["eSewa", "Khalti", "Bank", "Cash"].map((m) => <button key={m} type="button" onClick={() => setMethod(m)} className={`min-h-10 rounded-lg border text-sm font-medium ${method === m ? "border-brand bg-brand-tint text-brand-strong" : "border-border-subtle text-ink-secondary"}`}>{m}</button>)}
          </div>
        </Field>
        <Field label="Reference"><input className={`${inputClass} w-full`} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ID (optional)" /></Field>
      </div>
      <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!Number(amount)} onClick={go}>Record payment</Button></div>
    </Modal>
  );
}

function PinModal({ user, cafeId, onClose, onDone, onError }: { user: { id: number; name: string } | null; cafeId: number; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) setPin(String(Math.floor(1000 + Math.random() * 9000))); }, [user]);
  async function go() {
    if (!user) return;
    setBusy(true);
    try {
      await platformFetchJson(`/platform/cafes/${cafeId}/users/${user.id}/reset-pin`, { method: "POST", headers: json, body: JSON.stringify({ pin }) });
      onDone(`${user.name}'s new PIN is ${pin}`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={!!user} onClose={onClose} title={`Reset PIN for ${user?.name ?? ""}`} size="sm">
      <p className="mb-4 text-sm text-ink-secondary">Tell them the new PIN over the phone. It also reactivates the account if it was turned off.</p>
      <input className={`${inputClass} tabular w-full text-center text-2xl tracking-[0.6em]`} inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
      <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={pin.length !== 4} onClick={go}>Set PIN</Button></div>
    </Modal>
  );
}
