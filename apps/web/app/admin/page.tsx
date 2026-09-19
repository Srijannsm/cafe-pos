"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetchJson } from "../../lib/api";
import { IconClipboardList, IconTable, IconChevronRight } from "../../components/icons";

type MenuItem = { isAvailable: boolean };
type TableRow = { status: "free" | "occupied" | "reserved" };

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={`card border-t-4 p-6 ${accent}`}>
      <p className="text-sm font-semibold text-stone-500">{label}</p>
      <p className="mt-2 text-4xl font-bold text-stone-900">{value}</p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiFetchJson<MenuItem[]>("/menu/all"), apiFetchJson<TableRow[]>("/tables")])
      .then(([itemsRes, tablesRes]) => {
        setItems(itemsRes);
        setTables(tablesRes);
      })
      .finally(() => setLoading(false));
  }, []);

  const availableItems = items.filter((item) => item.isAvailable).length;
  const freeTables = tables.filter((table) => table.status === "free").length;
  const occupiedTables = tables.filter((table) => table.status === "occupied").length;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-stone-900">Dashboard</h1>
        <p className="mt-1 text-sm text-stone-500">An overview of the menu and tables.</p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-stone-200" />
          ))}
        </div>
      ) : (
        <>
          <div>
            <h2 className="mb-3 text-xl font-bold text-stone-900">Menu</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Total menu items" value={items.length} accent="border-t-primary" />
              <StatCard label="Available items" value={availableItems} accent="border-t-primary" />
              <StatCard label="Hidden items" value={items.length - availableItems} accent="border-t-primary" />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-stone-900">Tables</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Total tables" value={tables.length} accent="border-t-info-subtle-fg" />
              <StatCard label="Free tables" value={freeTables} accent="border-t-info-subtle-fg" />
              <StatCard label="Occupied tables" value={occupiedTables} accent="border-t-info-subtle-fg" />
            </div>
          </div>
        </>
      )}

      <div>
        <h2 className="mb-3 text-xl font-bold text-stone-900">Quick links</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/menu"
            className="card flex items-center gap-4 p-5 transition hover:border-primary hover:shadow-md"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary-subtle-fg">
              <IconClipboardList />
            </span>
            <div className="flex-1">
              <p className="font-bold text-stone-900">Menu Management</p>
              <p className="text-sm text-stone-500">Categories, items, and modifiers.</p>
            </div>
            <IconChevronRight className="h-4 w-4 text-stone-300" />
          </Link>

          <Link
            href="/admin/tables"
            className="card flex items-center gap-4 p-5 transition hover:border-primary hover:shadow-md"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-info-subtle text-info-subtle-fg">
              <IconTable />
            </span>
            <div className="flex-1">
              <p className="font-bold text-stone-900">Tables</p>
              <p className="text-sm text-stone-500">Add tables and edit seating.</p>
            </div>
            <IconChevronRight className="h-4 w-4 text-stone-300" />
          </Link>
        </div>
      </div>
    </div>
  );
}
