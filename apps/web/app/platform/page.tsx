// apps/web/app/platform/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { platformFetchJson } from "../../lib/api";
import { PageHeader } from "../../components/ui/PageHeader";
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

export default function PlatformOverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [cafes, setCafes] = useState<CafeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      platformFetchJson<Overview>("/platform/overview"),
      platformFetchJson<CafeRow[]>("/platform/cafes"),
    ])
      .then(([ov, cl]) => {
        setOverview(ov);
        setCafes(cl.slice(0, 5));
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader title="Overview" description="Platform-wide stats and recent activity." />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading || !overview ? (
          Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Cafes" value={overview.totalCafes} />
            <StatCard label="Active cafes" value={overview.activeCafes} />
            <StatCard label="Staff, platform-wide" value={overview.totalStaff} />
            <StatCard label="Orders, all-time" value={overview.totalOrders} />
          </>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="heading-lg text-ink-primary">Recent cafes</h2>
          <Link href="/platform/cafes" className="label-sm font-medium text-brand-strong hover:underline">
            View all + add →
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-raised">
          <table className="w-full text-left">
            <thead>
              <tr className="label-sm border-b border-border-subtle text-ink-secondary">
                <th className="px-4 py-3">Cafe</th>
                <th className="px-4 py-3">Login URL</th>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center body-md text-ink-faint">Loading…</td>
                </tr>
              ) : cafes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center body-md text-ink-faint">No cafes yet.</td>
                </tr>
              ) : (
                cafes.map((cafe) => (
                  <tr key={cafe.id} className="transition hover:bg-surface-sunken">
                    <td className="px-4 py-3 body-md font-medium text-ink-primary">
                      <Link href={`/platform/cafes/${cafe.id}`} className="hover:underline text-brand-strong">
                        {cafe.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 body-md text-ink-secondary">/c/{cafe.slug}/login</td>
                    <td className="px-4 py-3 body-md text-ink-secondary">{cafe._count.users}</td>
                    <td className="px-4 py-3 body-md text-ink-secondary">{cafe._count.orders}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`label-sm rounded-pill px-3 py-1 font-semibold ${cafe.isActive ? "bg-status-success-tint text-status-success-ink" : "bg-surface-sunken text-ink-faint"}`}>
                        {cafe.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
