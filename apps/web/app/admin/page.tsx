"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetchJson } from "../../lib/api";
import { IconClipboardList, IconTable, IconChevronRight } from "../../components/icons";
import { Card } from "../../components/ui/Card";

type MenuItem = { isAvailable: boolean };
type TableRow = { status: "free" | "occupied" | "reserved" };

function StatCard({
  label,
  value,
  caption,
  captionTone,
}: {
  label: string;
  value: number;
  caption?: string;
  captionTone?: "success" | "warning";
}) {
  return (
    <Card>
      <p className="label-md text-ink-secondary">{label}</p>
      <p className="display-md mt-2 text-ink-primary">{value}</p>
      {caption && (
        <p className={`body-sm mt-1 ${captionTone === "warning" ? "text-status-warning-ink" : "text-status-success-ink"}`}>
          {caption}
        </p>
      )}
    </Card>
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
  const hiddenItems = items.length - availableItems;
  const freeTables = tables.filter((table) => table.status === "free").length;
  const occupiedTables = tables.filter((table) => table.status === "occupied").length;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="display-md text-ink-primary">Dashboard</h1>
        <p className="body-md mt-1 text-ink-secondary">An overview of the menu and tables.</p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-surface-sunken" />
          ))}
        </div>
      ) : (
        <>
          <div>
            <h2 className="heading-lg mb-3 text-ink-primary">Menu</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Total menu items" value={items.length} />
              <StatCard
                label="Available items"
                value={availableItems}
                caption="Visible to customers"
                captionTone="success"
              />
              <StatCard label="Hidden items" value={hiddenItems} caption="Hidden from customers" captionTone="warning" />
            </div>
          </div>

          <div>
            <h2 className="heading-lg mb-3 text-ink-primary">Tables</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Total tables" value={tables.length} />
              <StatCard label="Free tables" value={freeTables} caption="Ready to seat" captionTone="success" />
              <StatCard label="Occupied tables" value={occupiedTables} caption="Currently seated" captionTone="warning" />
            </div>
          </div>
        </>
      )}

      <div>
        <h2 className="heading-lg mb-3 text-ink-primary">Quick links</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/admin/menu" className="block">
            <Card className="transition hover:border-border-strong hover:shadow-md">
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-strong">
                  <IconClipboardList />
                </span>
                <div className="flex-1">
                  <p className="body-md font-bold text-ink-primary">Menu Management</p>
                  <p className="body-sm text-ink-secondary">Categories, items, and modifiers.</p>
                </div>
                <IconChevronRight className="h-4 w-4 text-ink-faint" />
              </div>
            </Card>
          </Link>

          <Link href="/admin/tables" className="block">
            <Card className="transition hover:border-border-strong hover:shadow-md">
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-status-info-tint text-status-info-ink">
                  <IconTable />
                </span>
                <div className="flex-1">
                  <p className="body-md font-bold text-ink-primary">Tables</p>
                  <p className="body-sm text-ink-secondary">Add tables and edit seating.</p>
                </div>
                <IconChevronRight className="h-4 w-4 text-ink-faint" />
              </div>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
