"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetchJson } from "../../lib/api";
import { IconClipboardList, IconTable, IconChevronRight } from "../../components/icons";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatCard, StatSkeleton } from "../../components/ui/StatCard";
import { ErrorState } from "../../components/ui/ErrorState";

type MenuItem = { isAvailable: boolean };
type TableRow = { status: "free" | "occupied" | "reserved" };

export default function AdminDashboardPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    Promise.all([apiFetchJson<MenuItem[]>("/menu/all"), apiFetchJson<TableRow[]>("/tables")])
      .then(([itemsRes, tablesRes]) => {
        setItems(itemsRes);
        setTables(tablesRes);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const availableItems = items.filter((item) => item.isAvailable).length;
  const hiddenItems = items.length - availableItems;
  const freeTables = tables.filter((table) => table.status === "free").length;
  const occupiedTables = tables.filter((table) => table.status === "occupied").length;

  return (
    <div className="space-y-10">
      <PageHeader title="Dashboard" description="An overview of the menu and tables." />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      ) : loadError ? (
        <ErrorState
          title="Couldn't load dashboard"
          description="The stats didn't come through — check your connection and try again."
          onRetry={() => {
            setLoading(true);
            setLoadError(false);
            Promise.all([apiFetchJson<MenuItem[]>("/menu/all"), apiFetchJson<TableRow[]>("/tables")])
              .then(([itemsRes, tablesRes]) => {
                setItems(itemsRes);
                setTables(tablesRes);
                setLoadError(false);
              })
              .catch(() => setLoadError(true))
              .finally(() => setLoading(false));
          }}
        />
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
