// apps/web/app/platform/cafes/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { platformFetchJson } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import { IconPlus, IconBanknote, IconReceipt } from "../../../components/icons";
import { SectionCard } from "../../admin/_components/SectionCard";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/Button";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { Input } from "../../../components/ui/Input";
import { InlineAlert } from "../../../components/ui/InlineAlert";

type CafeRow = {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  _count: { users: number; orders: number };
};

type CreatedCafe = {
  id: number;
  name: string;
  slug: string;
  users: { id: number; name: string; role: string }[];
};

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CAFE_COLUMNS: Column[] = [
  { header: "Cafe", skeletonWidth: "w-28" },
  { header: "Login URL", skeletonWidth: "w-24" },
  { header: "Staff", skeletonWidth: "w-8" },
  { header: "Orders", skeletonWidth: "w-10" },
  { header: "Status", headerClassName: "text-right", skeletonWidth: "w-16", skeletonVariant: "badge" },
];

export default function CafesPage() {
  const { showToast, toastHost } = useToast();

  const [cafes, setCafes] = useState<CafeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Create form
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState("13");
  const [panNumber, setPanNumber] = useState("");
  const [saving, setSaving] = useState(false);

  // Post-creation summary
  const [createdCafe, setCreatedCafe] = useState<CreatedCafe | null>(null);
  const [createdPin, setCreatedPin] = useState("");

  async function loadCafes() {
    try {
      const data = await platformFetchJson<CafeRow[]>("/platform/cafes");
      setCafes(data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCafes(); }, []);

  async function handleCreateCafe(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await platformFetchJson<CreatedCafe>("/platform/cafes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          adminName,
          adminPin,
          vatEnabled,
          vatRate: vatEnabled ? Number(vatRate) : undefined,
          panNumber: vatEnabled ? (panNumber.trim() || null) : undefined,
        }),
      });
      setCreatedCafe(created);
      setCreatedPin(adminPin);
      setName(""); setSlug(""); setSlugTouched(false);
      setAdminName(""); setAdminPin("");
      setVatEnabled(false); setVatRate("13"); setPanNumber("");
      await loadCafes();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not create that cafe", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(cafe: CafeRow) {
    try {
      await platformFetchJson(`/platform/cafes/${cafe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !cafe.isActive }),
      });
      await loadCafes();
      showToast(cafe.isActive ? `"${cafe.name}" deactivated` : `"${cafe.name}" reactivated`);
    } catch {
      showToast(`Could not update "${cafe.name}"`, "error");
    }
  }

  return (
    <div className="space-y-8">
      {toastHost}
      <PageHeader title="Cafes" description="Onboard cafes and manage tenants." />

      {/* Post-creation summary card */}
      {createdCafe && (
        <div className="rounded-xl border border-status-success-ink/20 bg-status-success-tint p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="label-sm font-semibold text-status-success-ink mb-2">
                ✓ &ldquo;{createdCafe.name}&rdquo; is live
              </p>
              <p className="body-md font-medium text-ink-primary">Login URL</p>
              <p className="body-md text-ink-secondary font-mono mb-3">/c/{createdCafe.slug}/login</p>
              <p className="body-md font-medium text-ink-primary">Admin account</p>
              <p className="body-md text-ink-secondary">
                {createdCafe.users[0]?.name} — PIN: <span className="font-mono font-semibold">{createdPin}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreatedCafe(null)}
              className="label-sm text-ink-faint hover:text-ink-secondary"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <SectionCard
        icon={<IconPlus />}
        title="New cafe"
        description="Creates the cafe and its first admin in one step — they can log in right away."
      >
        <form onSubmit={handleCreateCafe} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <label className="label-sm text-ink-faint">Cafe name</label>
              <Input
                className="w-52"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="label-sm text-ink-faint">Slug (login URL)</label>
              <Input
                className="w-44"
                value={slug}
                onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
                required
              />
              <span className="label-sm text-ink-faint">/c/{slug || "…"}/login</span>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="label-sm text-ink-faint">First admin&apos;s name</label>
              <Input className="w-44" value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="label-sm text-ink-faint">Their 4-digit PIN</label>
              <Input
                className="w-28"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                pattern="[0-9]{4}"
                required
              />
            </div>
          </div>

          {/* VAT section */}
          <div className="rounded-lg border border-border-subtle bg-surface-sunken p-4 space-y-3">
            <div className="flex items-center gap-2">
              <IconReceipt className="h-4 w-4 text-ink-faint" />
              <span className="label-sm font-medium text-ink-secondary">VAT / Tax</span>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={vatEnabled}
                onChange={(e) => setVatEnabled(e.target.checked)}
                className="h-4 w-4 rounded accent-brand"
              />
              <span className="body-md text-ink-primary">VAT registered</span>
            </label>
            {vatEnabled && (
              <div className="flex flex-wrap gap-3">
                <div className="flex flex-col gap-1">
                  <label className="label-sm text-ink-faint">VAT rate (%)</label>
                  <Input
                    className="w-24"
                    type="number"
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    min={0}
                    max={100}
                    step={0.1}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="label-sm text-ink-faint">PAN number</label>
                  <Input
                    className="w-44"
                    value={panNumber}
                    onChange={(e) => setPanNumber(e.target.value)}
                    placeholder="e.g. 123456789"
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <Button type="submit" disabled={saving || !name || !slug || !adminName || adminPin.length !== 4}>
              Create cafe
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard icon={<IconBanknote />} title="All cafes" description="Every tenant and their current status.">
        <DataTable
          columns={CAFE_COLUMNS}
          data={cafes}
          rowKey={(c) => c.id}
          loading={loading}
          error={loadError}
          onRetry={() => { setLoading(true); setLoadError(false); loadCafes(); }}
          skeletonRows={3}
          empty={{
            icon: <IconBanknote className="h-6 w-6" />,
            title: "No cafes yet",
            description: "Create the first one using the form above.",
          }}
          renderRow={(cafe) => (
            <>
              <td className="py-4 pr-4">
                <Link href={`/platform/cafes/${cafe.id}`} className="body-md font-medium text-brand-strong hover:underline">
                  {cafe.name}
                </Link>
              </td>
              <td className="py-4 pr-4 body-md text-ink-secondary">/c/{cafe.slug}/login</td>
              <td className="py-4 pr-4 body-md text-ink-secondary">{cafe._count.users}</td>
              <td className="py-4 pr-4 body-md text-ink-secondary">{cafe._count.orders}</td>
              <td className="py-4 pr-0 text-right">
                <button
                  type="button"
                  onClick={() => handleToggleActive(cafe)}
                  className={`label-sm rounded-pill px-3 py-1 font-semibold transition ${
                    cafe.isActive
                      ? "bg-status-success-tint text-status-success-ink hover:brightness-95"
                      : "bg-surface-sunken text-ink-faint hover:brightness-95"
                  }`}
                >
                  {cafe.isActive ? "Active" : "Inactive"}
                </button>
              </td>
            </>
          )}
        />
      </SectionCard>
    </div>
  );
}
