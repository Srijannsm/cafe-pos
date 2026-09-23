"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  platformFetchJson,
  getPlatformToken,
  getCurrentPlatformUser,
  platformLogout,
} from "../../lib/api";
import { useToast } from "../../components/Toast";
import { IconPlus, IconLogout, IconBanknote } from "../../components/icons";
import { SectionCard } from "../admin/_components/SectionCard";
import { Button } from "../../components/ui/Button";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatCard, StatSkeleton } from "../../components/ui/StatCard";

type CafeRow = {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  _count: { users: number; orders: number };
};

type Overview = {
  totalCafes: number;
  activeCafes: number;
  totalStaff: number;
  totalOrders: number;
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

export default function PlatformDashboardPage() {
  const router = useRouter();
  const { showToast, toastHost } = useToast();

  const [ready, setReady] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [cafes, setCafes] = useState<CafeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [saving, setSaving] = useState(false);

  async function refreshAll() {
    const [overviewRes, cafesRes] = await Promise.all([
      platformFetchJson<Overview>("/platform/overview"),
      platformFetchJson<CafeRow[]>("/platform/cafes"),
    ]);
    setOverview(overviewRes);
    setCafes(cafesRes);
  }

  useEffect(() => {
    if (!getPlatformToken()) {
      router.replace("/platform/login");
      return;
    }
    refreshAll()
      .then(() => {
        setReady(true);
        setLoadError(false);
      })
      .catch(() => {
        setLoadError(true);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateCafe(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await platformFetchJson("/platform/cafes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, adminName, adminPin }),
      });
      showToast(`"${name}" is live at /c/${slug}/login`);
      setName("");
      setSlug("");
      setSlugTouched(false);
      setAdminName("");
      setAdminPin("");
      await refreshAll();
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
      await refreshAll();
      showToast(cafe.isActive ? `"${cafe.name}" deactivated` : `"${cafe.name}" reactivated`);
    } catch {
      showToast(`Could not update "${cafe.name}"`, "error");
    }
  }

  function handleLogout() {
    platformLogout();
    router.push("/platform/login");
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-canvas">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }

  const currentUser = getCurrentPlatformUser();

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 sm:p-10">
      {toastHost}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display-md text-ink-primary">Platform admin</h1>
          <p className="body-md mt-1 text-ink-secondary">
            {currentUser ? `Signed in as ${currentUser.username}. ` : ""}Onboard cafes and keep an eye on the platform.
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="label-sm flex items-center gap-1.5 rounded-md border border-border-subtle px-3 py-2 text-ink-secondary transition hover:bg-surface-sunken"
        >
          <IconLogout className="h-4 w-4" />
          Sign out
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {overview ? (
          <>
            <StatCard label="Cafes" value={overview.totalCafes} />
            <StatCard label="Active cafes" value={overview.activeCafes} />
            <StatCard label="Staff, platform-wide" value={overview.totalStaff} />
            <StatCard label="Orders, all-time" value={overview.totalOrders} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
        )}
      </div>

      <SectionCard
        icon={<IconPlus />}
        title="New cafe"
        description="Creates the cafe and its first admin in one step -- they can log in right away."
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
                onChange={(e) => {
                  setSlug(slugify(e.target.value));
                  setSlugTouched(true);
                }}
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
            <Button type="submit" disabled={saving || !name || !slug || !adminName || adminPin.length !== 4}>
              Create cafe
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard icon={<IconBanknote />} title="Cafes on the platform" description="Every tenant, and their current status.">
        <DataTable
          columns={CAFE_COLUMNS}
          data={cafes}
          rowKey={(c) => c.id}
          loading={loading}
          error={loadError}
          onRetry={() => {
            setLoading(true);
            setLoadError(false);
            refreshAll()
              .then(() => setReady(true))
              .catch(() => setLoadError(true))
              .finally(() => setLoading(false));
          }}
          skeletonRows={2}
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
