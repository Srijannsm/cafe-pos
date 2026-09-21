"use client";

import { useEffect, useState } from "react";
import {
  platformFetchJson,
  getPlatformSecret,
  setPlatformSecret,
  clearPlatformSecret,
} from "../../lib/api";
import { useToast } from "../../components/Toast";
import { IconGrid, IconPlus, IconKey } from "../../components/icons";
import { SectionCard } from "../admin/_components/SectionCard";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

type CafeRow = {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  _count: { users: number; orders: number };
};

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function PlatformAdminPage() {
  const { showToast, toastHost } = useToast();

  const [unlocked, setUnlocked] = useState(false);
  const [secretDraft, setSecretDraft] = useState("");
  const [checking, setChecking] = useState(true);

  const [cafes, setCafes] = useState<CafeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [saving, setSaving] = useState(false);

  async function refreshCafes() {
    const res = await platformFetchJson<CafeRow[]>("/platform/cafes");
    setCafes(res);
  }

  useEffect(() => {
    const stored = getPlatformSecret();
    if (!stored) {
      setChecking(false);
      return;
    }
    platformFetchJson<CafeRow[]>("/platform/cafes")
      .then((res) => {
        setCafes(res);
        setUnlocked(true);
      })
      .catch(() => clearPlatformSecret())
      .finally(() => {
        setChecking(false);
        setLoading(false);
      });
  }, []);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setPlatformSecret(secretDraft);
    try {
      const res = await platformFetchJson<CafeRow[]>("/platform/cafes");
      setCafes(res);
      setUnlocked(true);
    } catch {
      clearPlatformSecret();
      showToast("That secret didn't work", "error");
    } finally {
      setLoading(false);
    }
  }

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
      await refreshCafes();
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
      await refreshCafes();
      showToast(cafe.isActive ? `"${cafe.name}" deactivated` : `"${cafe.name}" reactivated`);
    } catch {
      showToast(`Could not update "${cafe.name}"`, "error");
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-canvas">
        <div className="h-8 w-40 animate-pulse rounded-md bg-surface-sunken" />
      </div>
    );
  }

  if (!unlocked) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-surface-canvas to-surface-sunken p-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-brand text-on-brand">
            <IconKey className="h-5 w-5" />
          </div>
          <h1 className="heading-lg text-ink-primary">Platform admin</h1>
          <p className="body-md mt-1 text-ink-secondary">Internal only -- enter the platform secret to continue.</p>
        </div>
        <form onSubmit={handleUnlock} className="flex flex-col gap-3">
          <Input
            type="password"
            autoFocus
            className="w-72"
            placeholder="Platform secret"
            value={secretDraft}
            onChange={(e) => setSecretDraft(e.target.value)}
          />
          <Button type="submit" disabled={!secretDraft}>
            Unlock
          </Button>
        </form>
        {toastHost}
      </main>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 sm:p-10">
      {toastHost}
      <div>
        <h1 className="display-md text-ink-primary">Platform admin</h1>
        <p className="body-md mt-1 text-ink-secondary">
          Onboard a new cafe with its first admin account, or deactivate one that shouldn&apos;t log in anymore.
        </p>
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

      <SectionCard icon={<IconGrid />} title="Cafes on the platform" description="Every tenant, and their current status.">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-surface-sunken" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="label-sm border-b border-border-subtle text-ink-secondary">
                  <th className="py-3 pr-4">Cafe</th>
                  <th className="py-3 pr-4">Login URL</th>
                  <th className="py-3 pr-4">Staff</th>
                  <th className="py-3 pr-4">Orders</th>
                  <th className="py-3 pr-0 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {cafes.map((cafe) => (
                  <tr key={cafe.id} className="border-b border-border-subtle last:border-0">
                    <td className="py-4 pr-4 body-md font-medium text-ink-primary">{cafe.name}</td>
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
                  </tr>
                ))}
                {cafes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center body-md text-ink-faint">
                      No cafes yet -- create the first one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
