"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetchJson } from "../../lib/api";
import { useCurrentUser } from "../../lib/useRequireAuth";
import { useCafeSettings } from "../../lib/CafeSettingsContext";
import { Panel, Pill } from "../../components/ui/Field";
import { StatCard, StatSkeleton } from "../../components/ui/StatCard";
import { Button } from "../../components/ui/Button";
import { IconBanknote, IconReceipt, IconTable, IconWallet, IconChevronRight, IconPlus, IconTruck, IconBarChart, IconBox } from "../../components/icons";
import { BarChart } from "../../components/admin/charts";
import { localDay, addDays, num, rs, timeAgo, ago, tableLabel } from "../../lib/format";
import type { ShiftSummary } from "../../components/admin/cash";
import type { StockItem } from "../../components/admin/inventory";

type TableRow = { id: number; tableNumber: string; status: string; activeOrderStatus: string | null; runningTotal: string; orderStartedAt: string | null; unsentCount: number; requests: unknown[] };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function AdminDashboard() {
  const { settings } = useCafeSettings();
  const [today, setToday] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [week, setWeek] = useState<{ period: string; sales: string; bills: number }[]>([]);
  const [top, setTop] = useState<{ name: string; qty: number; sales: string }[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [shift, setShift] = useState<ShiftSummary | null | undefined>(undefined);
  const [low, setLow] = useState<StockItem[] | null>([]);
  const [reportsOff, setReportsOff] = useState(false);
  const user = useCurrentUser();
  // Date/greeting computed after mount -- this page is pre-rendered at build
  // time, so using the clock during render would freeze the build's date.
  const [hello, setHello] = useState<{ greet: string; date: string } | null>(null);
  useEffect(() => {
    setHello({ greet: greeting(), date: new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) });
  }, []);

  useEffect(() => {
    const d = localDay();
    const tz = -new Date().getTimezoneOffset();
    apiFetchJson(`/reports/overview?from=${d}&to=${d}&tz=${tz}`).then(setToday).catch(() => setReportsOff(true));
    apiFetchJson<{ series: { period: string; sales: string; bills: number }[] }>(`/reports/overview?from=${addDays(d, -6)}&to=${d}&tz=${tz}`).then((r) => setWeek(r.series)).catch(() => {});
    apiFetchJson<{ items: { name: string; qty: number; sales: string }[] }>(`/reports/items?from=${d}&to=${d}&tz=${tz}`).then((r) => setTop(r.items.slice(0, 5))).catch(() => {});
    apiFetchJson<TableRow[]>("/tables").then(setTables).catch(() => {});
    apiFetchJson<ShiftSummary | null>("/shifts/current").then(setShift).catch(() => setShift(null));
    apiFetchJson<StockItem[]>("/inventory/items").then((i) => setLow(i.filter((x) => x.isActive && x.status !== "ok"))).catch(() => setLow(null)); // null = not in plan
  }, []);

  const occupied = tables.filter((t) => t.status === "occupied");
  const openTotal = occupied.reduce((s, t) => s + Number(t.runningTotal), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="h-5 text-sm text-ink-secondary">{hello?.date}</p>
          <h1 className="text-2xl font-semibold text-ink-primary">{hello?.greet ?? "Welcome"}{user ? `, ${user.name}` : ""}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/menu"><Button variant="secondary" icon={<IconPlus />}>Menu item</Button></Link>
          {settings?.inventoryEnabled !== false && <Link href="/admin/inventory/purchases"><Button variant="secondary" icon={<IconTruck />}>Stock in</Button></Link>}
          <Link href="/"><Button icon={<IconTable />}>Open tables</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {today ? (
          <>
            <StatCard icon={<IconBanknote />} label="Sales today" value={rs(today.summary.collected)} caption={`${today.summary.bills} bills · avg ${rs(today.summary.avgBill)}`} />
            <StatCard icon={<IconTable />} label="Open tables" value={`${occupied.length} / ${tables.filter((t) => t.status !== "reserved").length}`} caption={occupied.length ? `${rs(openTotal)} still on tables` : "No tables open"} />
            <StatCard icon={<IconReceipt />} label="Discounts & voids" value={rs(Number(today.summary.discounts) + Number(today.summary.voidAmount))} caption={`${today.summary.voidCount} voided items`} captionTone={today.summary.voidCount ? "warning" : undefined} />
            <StatCard icon={<IconWallet />} label="Cash drawer" value={shift ? rs(shift.expectedCash) : "Closed"} caption={shift ? `Open since ${ago(shift.openedAt)}` : "Open a shift to track cash"} captionTone={shift ? undefined : "warning"} />
          </>
        ) : reportsOff ? (
          <>
            <StatCard icon={<IconTable />} label="Open tables" value={`${occupied.length} / ${tables.length}`} caption={`${rs(openTotal)} on tables`} />
            <StatCard icon={<IconWallet />} label="Cash drawer" value={shift ? rs(shift.expectedCash) : "Closed"} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold">Last 7 days</h3>
            {!reportsOff && <Link href="/admin/reports" className="flex items-center gap-1 text-sm font-medium text-brand-strong">Reports <IconChevronRight className="h-4 w-4" /></Link>}
          </div>
          {reportsOff ? (
            <p className="py-10 text-center text-sm text-ink-faint">Reports are included from the Standard plan.</p>
          ) : week.length ? (
            <BarChart data={week.map((w) => ({ label: w.period, value: Number(w.sales), sub: `${w.bills} bills` }))} height={200} />
          ) : (
            <div className="h-[200px] animate-pulse rounded-xl bg-surface-sunken" />
          )}
        </Panel>
        <Panel>
          <h3 className="mb-4 text-base font-semibold">Top sellers today</h3>
          {top.length === 0 ? <p className="text-sm text-ink-faint">Nothing sold yet today.</p> : (
            <ol className="space-y-3">
              {top.map((t, i) => (
                <li key={t.name} className="flex items-center gap-3 text-sm">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-sunken text-xs font-semibold text-ink-secondary">{i + 1}</span>
                  <span className="flex-1 truncate font-medium">{t.name}</span>
                  <span className="text-ink-faint">{t.qty}×</span>
                  <span className="tabular w-20 text-right">{rs(t.sales)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold">Live tables</h3>
            <Link href="/" className="flex items-center gap-1 text-sm font-medium text-brand-strong">Open <IconChevronRight className="h-4 w-4" /></Link>
          </div>
          {occupied.length === 0 ? <p className="text-sm text-ink-faint">No open tables.</p> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {occupied.map((t) => (
                <div key={t.id} className="rounded-xl border border-border-subtle p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{tableLabel(t.tableNumber)}</p>
                    {t.requests.length > 0 ? <Pill tone="danger">Calling</Pill> : t.unsentCount > 0 ? <Pill tone="warning">New</Pill> : <Pill tone="info">{t.activeOrderStatus}</Pill>}
                  </div>
                  <p className="tabular mt-2 text-sm font-medium">{rs(t.runningTotal)}</p>
                  {t.orderStartedAt && <p className="text-xs text-ink-faint">{timeAgo(t.orderStartedAt)}</p>}
                </div>
              ))}
            </div>
          )}
        </Panel>
        {settings?.inventoryEnabled !== false && low && (
          <Panel>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">Running low</h3>
              <Link href="/admin/inventory" className="flex items-center gap-1 text-sm font-medium text-brand-strong">Stock <IconChevronRight className="h-4 w-4" /></Link>
            </div>
            {low.length === 0 ? (
              <div className="flex items-center gap-3 text-sm text-ink-secondary"><IconBox className="h-5 w-5 text-status-success" /> Everything is stocked.</div>
            ) : (
              <ul className="space-y-2.5">
                {low.slice(0, 6).map((i) => (
                  <li key={i.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{i.name}</span>
                    <span className="flex items-center gap-2"><span className="tabular text-ink-secondary">{num(i.currentQty)} {i.unit}</span><Pill tone={i.status === "out" ? "danger" : "warning"}>{i.status === "out" ? "Out" : "Low"}</Pill></span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
        {(settings?.inventoryEnabled === false || !low) && (
          <Panel>
            <h3 className="mb-2 text-base font-semibold">Shortcuts</h3>
            <Link href="/admin/reports" className="flex items-center gap-2 py-2 text-sm text-ink-secondary"><IconBarChart className="h-4 w-4" /> Reports</Link>
          </Panel>
        )}
      </div>
    </div>
  );
}
