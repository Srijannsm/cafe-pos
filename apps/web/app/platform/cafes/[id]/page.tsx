"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { platformFetchJson, getPlatformToken } from "../../../../lib/api";
import { useToast } from "../../../../components/Toast";
import { IconChevronRight, IconUsers, IconClipboardList, IconReceipt, IconBanknote } from "../../../../components/icons";
import { SectionCard } from "../../../admin/_components/SectionCard";
import { ErrorState } from "../../../../components/ui/ErrorState";
import { Skeleton } from "../../../../components/ui/Skeleton";
import { StatCard } from "../../../../components/ui/StatCard";
import { Button } from "../../../../components/ui/Button";
import { InlineAlert } from "../../../../components/ui/InlineAlert";

type SubscriptionPlan = "starter" | "standard" | "premium";
type SubscriptionStatus = "trial" | "active" | "overdue" | "cancelled";

type CafeDetail = {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  vatEnabled: boolean;
  vatRate: string;
  panNumber: string | null;
  logoUrl: string | null;
  plan: SubscriptionPlan;
  billingCycle: string;
  subscriptionStatus: SubscriptionStatus;
  trialStartedAt: string;
  nextBillingAt: string | null;
  setupFeePaid: boolean;
  subscriptionNotes: string | null;
  createdAt: string;
  users: { id: number; name: string; role: string; isActive: boolean }[];
  _count: { menuItems: number; tables: number; orders: number };
  recentOrders: {
    id: number;
    orderType: string;
    status: string;
    total: string | null;
    createdAt: string;
    table: { tableNumber: string } | null;
  }[];
};

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  starter: "Starter — Rs. 999/mo",
  standard: "Standard — Rs. 1,999/mo",
  premium: "Premium — Rs. 3,499/mo",
};

const STATUS_STYLES: Record<SubscriptionStatus, string> = {
  trial: "bg-blue-50 text-blue-700",
  active: "bg-status-success-tint text-status-success-ink",
  overdue: "bg-yellow-50 text-yellow-700",
  cancelled: "bg-surface-sunken text-ink-faint",
};

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NP", { year: "numeric", month: "short", day: "numeric" });
}

export default function CafeDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { showToast, toastHost } = useToast();

  const [cafe, setCafe] = useState<CafeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // VAT edit state
  const [editingVat, setEditingVat] = useState(false);
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState("13");
  const [panNumber, setPanNumber] = useState("");
  const [vatSaving, setVatSaving] = useState(false);
  const [vatError, setVatError] = useState("");

  // Subscription edit state
  const [editingSub, setEditingSub] = useState(false);
  const [subPlan, setSubPlan] = useState<SubscriptionPlan>("starter");
  const [subCycle, setSubCycle] = useState("monthly");
  const [subStatus, setSubStatus] = useState<SubscriptionStatus>("trial");
  const [nextBilling, setNextBilling] = useState("");
  const [setupFeePaid, setSetupFeePaid] = useState(false);
  const [subNotes, setSubNotes] = useState("");
  const [subSaving, setSubSaving] = useState(false);
  const [subError, setSubError] = useState("");

  useEffect(() => {
    if (!getPlatformToken()) {
      router.replace("/platform/login");
      return;
    }
    platformFetchJson<CafeDetail>(`/platform/cafes/${params.id}`)
      .then((data) => {
        setCafe(data);
        // VAT
        setVatEnabled(data.vatEnabled);
        setVatRate(String(Number(data.vatRate)));
        setPanNumber(data.panNumber ?? "");
        // Subscription
        setSubPlan(data.plan);
        setSubCycle(data.billingCycle);
        setSubStatus(data.subscriptionStatus);
        setNextBilling(data.nextBillingAt ? data.nextBillingAt.slice(0, 10) : "");
        setSetupFeePaid(data.setupFeePaid);
        setSubNotes(data.subscriptionNotes ?? "");
      })
      .catch(() => showToast("Could not load that cafe", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleToggleActive() {
    if (!cafe) return;
    try {
      const updated = await platformFetchJson<CafeDetail>(`/platform/cafes/${cafe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !cafe.isActive }),
      });
      setCafe({ ...cafe, isActive: updated.isActive });
      showToast(cafe.isActive ? `"${cafe.name}" deactivated` : `"${cafe.name}" reactivated`);
    } catch {
      showToast("Could not update that cafe", "error");
    }
  }

  async function handleSaveVat() {
    if (!cafe) return;
    setVatError("");
    setVatSaving(true);
    try {
      const updated = await platformFetchJson<CafeDetail>(`/platform/cafes/${cafe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vatEnabled,
          vatRate: vatEnabled ? Number(vatRate) : undefined,
          panNumber: vatEnabled ? (panNumber.trim() || null) : null,
        }),
      });
      setCafe((prev) => prev ? { ...prev, vatEnabled: updated.vatEnabled, vatRate: updated.vatRate, panNumber: updated.panNumber } : prev);
      setEditingVat(false);
      showToast("VAT settings saved");
    } catch (err) {
      setVatError(err instanceof Error ? err.message : "Could not save VAT settings.");
    } finally {
      setVatSaving(false);
    }
  }

  function cancelVatEdit() {
    if (!cafe) return;
    setVatEnabled(cafe.vatEnabled);
    setVatRate(String(Number(cafe.vatRate)));
    setPanNumber(cafe.panNumber ?? "");
    setVatError("");
    setEditingVat(false);
  }

  async function handleSaveSub() {
    if (!cafe) return;
    setSubError("");
    setSubSaving(true);
    try {
      await platformFetchJson(`/platform/cafes/${cafe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: subPlan,
          billingCycle: subCycle,
          subscriptionStatus: subStatus,
          nextBillingAt: nextBilling || null,
          setupFeePaid,
          subscriptionNotes: subNotes.trim() || null,
        }),
      });
      setCafe((prev) => prev ? {
        ...prev,
        plan: subPlan,
        billingCycle: subCycle,
        subscriptionStatus: subStatus,
        nextBillingAt: nextBilling || null,
        setupFeePaid,
        subscriptionNotes: subNotes.trim() || null,
      } : prev);
      setEditingSub(false);
      showToast("Subscription updated");
    } catch (err) {
      setSubError(err instanceof Error ? err.message : "Could not save subscription.");
    } finally {
      setSubSaving(false);
    }
  }

  function cancelSubEdit() {
    if (!cafe) return;
    setSubPlan(cafe.plan);
    setSubCycle(cafe.billingCycle);
    setSubStatus(cafe.subscriptionStatus);
    setNextBilling(cafe.nextBillingAt ? cafe.nextBillingAt.slice(0, 10) : "");
    setSetupFeePaid(cafe.setupFeePaid);
    setSubNotes(cafe.subscriptionNotes ?? "");
    setSubError("");
    setEditingSub(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-canvas">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }

  if (!cafe) {
    return (
      <div className="mx-auto max-w-3xl p-6 sm:p-10">
        {toastHost}
        <ErrorState
          title="Cafe not found"
          description="That cafe couldn't be loaded. It may have been removed."
        />
        <div className="mt-4 text-center">
          <Link href="/platform" className="body-md font-medium text-brand-strong hover:underline">
            Back to platform admin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 sm:p-10">
      {toastHost}
      <div>
        <Link href="/platform" className="label-sm flex items-center gap-1 text-ink-secondary hover:text-ink-primary">
          <IconChevronRight className="h-3 w-3 rotate-180" />
          All cafes
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="display-md text-ink-primary">{cafe.name}</h1>
            <p className="body-md mt-1 text-ink-secondary">/c/{cafe.slug}/login</p>
          </div>
          <button
            type="button"
            onClick={handleToggleActive}
            className={`label-sm rounded-pill px-4 py-2 font-semibold transition ${
              cafe.isActive
                ? "bg-status-success-tint text-status-success-ink hover:brightness-95"
                : "bg-surface-sunken text-ink-faint hover:brightness-95"
            }`}
          >
            {cafe.isActive ? "Active" : "Inactive"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Menu items" value={cafe._count.menuItems} />
        <StatCard label="Tables" value={cafe._count.tables} />
        <StatCard label="Orders, all-time" value={cafe._count.orders} />
      </div>

      {/* Subscription */}
      <SectionCard icon={<IconBanknote />} title="Subscription" description="Manually track the billing plan and status for this cafe.">
        {editingSub ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label-sm mb-1 block text-ink-secondary">Plan</label>
                <select
                  value={subPlan}
                  onChange={(e) => setSubPlan(e.target.value as SubscriptionPlan)}
                  className="body-md w-full rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-ink-primary focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="starter">Starter — Rs. 999/mo</option>
                  <option value="standard">Standard — Rs. 1,999/mo</option>
                  <option value="premium">Premium — Rs. 3,499/mo</option>
                </select>
              </div>
              <div>
                <label className="label-sm mb-1 block text-ink-secondary">Billing cycle</label>
                <select
                  value={subCycle}
                  onChange={(e) => setSubCycle(e.target.value)}
                  className="body-md w-full rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-ink-primary focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <label className="label-sm mb-1 block text-ink-secondary">Status</label>
                <select
                  value={subStatus}
                  onChange={(e) => setSubStatus(e.target.value as SubscriptionStatus)}
                  className="body-md w-full rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-ink-primary focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="trial">Trial</option>
                  <option value="active">Active</option>
                  <option value="overdue">Overdue</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="label-sm mb-1 block text-ink-secondary">Next billing date</label>
                <input
                  type="date"
                  value={nextBilling}
                  onChange={(e) => setNextBilling(e.target.value)}
                  className="body-md w-full rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-ink-primary focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={setupFeePaid}
                onChange={(e) => setSetupFeePaid(e.target.checked)}
                className="h-4 w-4 rounded accent-brand"
              />
              <span className="body-md text-ink-primary">Setup fee paid</span>
            </label>

            <div>
              <label className="label-sm mb-1 block text-ink-secondary">Notes (internal)</label>
              <textarea
                value={subNotes}
                onChange={(e) => setSubNotes(e.target.value)}
                rows={2}
                placeholder="e.g. paid via eSewa, contact: 98XXXXXXXX"
                className="body-md w-full rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-ink-primary focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>

            {subError && <InlineAlert>{subError}</InlineAlert>}

            <div className="flex items-center gap-2">
              <Button onClick={handleSaveSub} loading={subSaving} size="small">Save</Button>
              <Button onClick={cancelSubEdit} variant="ghost" size="small" disabled={subSaving}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="body-md font-medium text-ink-primary">{PLAN_LABELS[cafe.plan]}</span>
                <span className={`label-sm rounded-pill px-2.5 py-0.5 font-semibold capitalize ${STATUS_STYLES[cafe.subscriptionStatus]}`}>
                  {cafe.subscriptionStatus}
                </span>
              </div>
              <p className="body-sm text-ink-secondary">
                {cafe.billingCycle === "yearly" ? "Yearly" : "Monthly"} billing
                {cafe.nextBillingAt ? ` · Next: ${formatDate(cafe.nextBillingAt)}` : ""}
                {" · "}Setup fee: {cafe.setupFeePaid ? "paid" : "not paid"}
              </p>
              <p className="body-sm text-ink-secondary">
                Trial started: {formatDate(cafe.trialStartedAt)}
              </p>
              {cafe.subscriptionNotes && (
                <p className="body-sm text-ink-faint italic">{cafe.subscriptionNotes}</p>
              )}
            </div>
            <Button onClick={() => setEditingSub(true)} variant="secondary" size="small">Edit</Button>
          </div>
        )}
      </SectionCard>

      {/* VAT Settings */}
      <SectionCard icon={<IconReceipt />} title="VAT / Tax settings" description="Enable VAT for this cafe to show tax breakdowns on bills and receipts.">
        {editingVat ? (
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={vatEnabled}
                onChange={(e) => setVatEnabled(e.target.checked)}
                className="h-4 w-4 rounded accent-brand"
              />
              <span className="body-md text-ink-primary font-medium">VAT registered</span>
            </label>

            {vatEnabled && (
              <>
                <div>
                  <label className="label-sm mb-1 block text-ink-secondary">VAT rate (%)</label>
                  <input
                    type="number"
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    min={0}
                    max={100}
                    step={0.1}
                    className="body-md w-32 rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-ink-primary focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="label-sm mb-1 block text-ink-secondary">PAN number</label>
                  <input
                    type="text"
                    value={panNumber}
                    onChange={(e) => setPanNumber(e.target.value)}
                    placeholder="e.g. 123456789"
                    className="body-md w-full max-w-xs rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-ink-primary focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                  <p className="body-sm mt-1 text-ink-faint">Printed on receipts for IRD compliance.</p>
                </div>
              </>
            )}

            {vatError && <InlineAlert>{vatError}</InlineAlert>}

            <div className="flex items-center gap-2">
              <Button onClick={handleSaveVat} loading={vatSaving} size="small">
                Save
              </Button>
              <Button onClick={cancelVatEdit} variant="ghost" size="small" disabled={vatSaving}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="body-md text-ink-primary">
                {cafe.vatEnabled ? (
                  <>
                    <span className="font-medium">VAT enabled</span>
                    {" · "}{Number(cafe.vatRate)}%
                    {cafe.panNumber && <>{" · PAN: "}{cafe.panNumber}</>}
                  </>
                ) : (
                  <span className="text-ink-faint">VAT not enabled for this cafe.</span>
                )}
              </p>
            </div>
            <Button onClick={() => setEditingVat(true)} variant="secondary" size="small">
              Edit
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard icon={<IconUsers />} title="Staff" description={`${cafe.users.length} account(s) at this cafe.`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="label-sm border-b border-border-subtle text-ink-secondary">
                <th className="py-3 pr-4">Name</th>
                <th className="py-3 pr-4">Role</th>
                <th className="py-3 pr-0">Status</th>
              </tr>
            </thead>
            <tbody>
              {cafe.users.map((u) => (
                <tr key={u.id} className="border-b border-border-subtle last:border-0">
                  <td className="py-3 pr-4 body-md font-medium text-ink-primary">{u.name}</td>
                  <td className="py-3 pr-4 body-md text-ink-secondary">{roleLabel(u.role)}</td>
                  <td className="py-3 pr-0 body-md text-ink-secondary">{u.isActive ? "Active" : "Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard icon={<IconClipboardList />} title="Recent orders" description="The last 10 orders placed at this cafe.">
        {cafe.recentOrders.length === 0 ? (
          <p className="body-md text-ink-faint">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="label-sm border-b border-border-subtle text-ink-secondary">
                  <th className="py-3 pr-4">Order</th>
                  <th className="py-3 pr-4">Type</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-0 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {cafe.recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-border-subtle last:border-0">
                    <td className="py-3 pr-4 body-md font-medium text-ink-primary">
                      #{order.id}
                      {order.table ? ` · Table ${order.table.tableNumber}` : ""}
                    </td>
                    <td className="py-3 pr-4 body-md text-ink-secondary">{order.orderType.replace("_", " ")}</td>
                    <td className="py-3 pr-4 body-md text-ink-secondary">{order.status}</td>
                    <td className="py-3 pr-0 text-right body-md text-ink-secondary">
                      {order.total ?? "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
