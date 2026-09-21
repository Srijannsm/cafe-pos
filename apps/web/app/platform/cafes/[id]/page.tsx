"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { platformFetchJson, getPlatformToken } from "../../../../lib/api";
import { useToast } from "../../../../components/Toast";
import { IconChevronRight, IconUsers, IconClipboardList, IconReceipt } from "../../../../components/icons";
import { SectionCard } from "../../../admin/_components/SectionCard";

type CafeDetail = {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
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

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function CafeDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { showToast, toastHost } = useToast();

  const [cafe, setCafe] = useState<CafeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getPlatformToken()) {
      router.replace("/platform/login");
      return;
    }
    platformFetchJson<CafeDetail>(`/platform/cafes/${params.id}`)
      .then(setCafe)
      .catch(() => showToast("Could not load that cafe", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleToggleActive() {
    if (!cafe) return;
    try {
      await platformFetchJson(`/platform/cafes/${cafe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !cafe.isActive }),
      });
      setCafe({ ...cafe, isActive: !cafe.isActive });
      showToast(cafe.isActive ? `"${cafe.name}" deactivated` : `"${cafe.name}" reactivated`);
    } catch {
      showToast("Could not update that cafe", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-canvas">
        <div className="h-8 w-40 animate-pulse rounded-md bg-surface-sunken" />
      </div>
    );
  }

  if (!cafe) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6 sm:p-10">
        {toastHost}
        <p className="body-md text-ink-secondary">That cafe couldn&apos;t be found.</p>
        <Link href="/platform" className="body-md font-medium text-brand-strong hover:underline">
          Back to platform admin
        </Link>
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
        <div className="rounded-lg border border-border-subtle bg-surface-raised p-4 text-center shadow-sm">
          <p className="display-md text-ink-primary">{cafe._count.menuItems}</p>
          <p className="label-sm text-ink-secondary">Menu items</p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface-raised p-4 text-center shadow-sm">
          <p className="display-md text-ink-primary">{cafe._count.tables}</p>
          <p className="label-sm text-ink-secondary">Tables</p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface-raised p-4 text-center shadow-sm">
          <p className="display-md text-ink-primary">{cafe._count.orders}</p>
          <p className="label-sm text-ink-secondary">Orders, all-time</p>
        </div>
      </div>

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
                      <IconReceipt className="mr-1 inline h-3 w-3" />
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
