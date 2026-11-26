"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, apiFetchJson, type CurrentUser } from "../../lib/api";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { AdminShell } from "../../components/admin/AdminShell";
import { Skeleton } from "../../components/ui/Skeleton";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ready = useRequireAuth();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [reportsEnabled, setReportsEnabled] = useState(false);
  const [lowStock, setLowStock] = useState(0);
  const [inventoryInPlan, setInventoryInPlan] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const current = getCurrentUser();
    if (current?.role !== "admin") {
      router.replace("/");
      return;
    }
    setUser(current);
    apiFetchJson<{ features: { reports: boolean; inventory: boolean } }>("/cafes/my-plan")
      .then((data) => {
        setReportsEnabled(data.features.reports);
        setInventoryInPlan(data.features.inventory);
        if (data.features.inventory) {
          apiFetchJson<{ count: number }>("/inventory/low-stock").then((d) => setLowStock(d.count)).catch(() => {});
        }
      })
      .catch(() => setReportsEnabled(false));
  }, [ready, router]);

  // Pick up changes to the signed-in user made in this tab (e.g. own photo).
  useEffect(() => {
    const reread = () => setUser(getCurrentUser());
    window.addEventListener("currentuser-change", reread);
    return () => window.removeEventListener("currentuser-change", reread);
  }, []);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-canvas">
        <Skeleton className="h-8 w-40 rounded-md" />
      </div>
    );
  }

  return (
    <AdminShell user={user} reportsEnabled={reportsEnabled} inventoryInPlan={inventoryInPlan} lowStock={lowStock}>
      {children}
    </AdminShell>
  );
}
