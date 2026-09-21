"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { SectionCard } from "../_components/SectionCard";
import { Card } from "../../../components/ui/Card";
import { IconBarChart, IconReceipt, IconBanknote, IconQrCode } from "../../../components/icons";

type Summary = {
  from: string;
  to: string;
  totalRevenue: string;
  totalOrders: number;
  avgOrderValue: string;
};

type RevenueDay = { date: string; revenue: string; orders: number };
type TopItem = { menuItemId: number; name: string; quantitySold: number; revenue: string };
type PaymentMethodRow = { method: string; amount: string; count: number };

const RANGE_PRESETS = [
  { label: "Today", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
] as const;

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  esewa_qr: "eSewa QR",
  khalti_qr: "Khalti QR",
  fonepay_qr: "FonePay QR",
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <p className="label-md text-ink-secondary">{label}</p>
      <p className="display-md mt-2 text-ink-primary">{value}</p>
    </Card>
  );
}

export default function ReportsPage() {
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenueByDay, setRevenueByDay] = useState<RevenueDay[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);

  const refresh = useCallback(async (days: number) => {
    setLoading(true);
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const query = `from=${isoDate(from)}&to=${isoDate(to)}`;

    const [summaryRes, revenueRes, topItemsRes, methodsRes] = await Promise.all([
      apiFetchJson<Summary>(`/reports/summary?${query}`),
      apiFetchJson<RevenueDay[]>(`/reports/revenue-by-day?${query}`),
      apiFetchJson<TopItem[]>(`/reports/top-items?${query}`),
      apiFetchJson<PaymentMethodRow[]>(`/reports/payment-methods?${query}`),
    ]);

    setSummary(summaryRes);
    setRevenueByDay(revenueRes);
    setTopItems(topItemsRes);
    setPaymentMethods(methodsRes);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh(rangeDays);
  }, [rangeDays, refresh]);

  const maxDayRevenue = Math.max(1, ...revenueByDay.map((d) => Number(d.revenue)));
  const totalMethodAmount = paymentMethods.reduce((sum, m) => sum + Number(m.amount), 0) || 1;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display-md text-ink-primary">Reports</h1>
          <p className="body-md mt-1 text-ink-secondary">Revenue, top sellers, and payment mix for this cafe.</p>
        </div>
        <div className="flex gap-2">
          {RANGE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setRangeDays(preset.days)}
              className={`label-sm rounded-pill px-3 py-2 font-semibold transition ${
                rangeDays === preset.days
                  ? "bg-brand text-on-brand"
                  : "border border-border-subtle text-ink-secondary hover:bg-surface-sunken"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {loading || !summary ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-surface-sunken" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Revenue" value={`Rs ${summary.totalRevenue}`} />
          <StatCard label="Orders paid" value={summary.totalOrders} />
          <StatCard label="Avg order value" value={`Rs ${summary.avgOrderValue}`} />
        </div>
      )}

      <SectionCard icon={<IconBarChart />} title="Revenue by day" description="Money collected each day in this range.">
        {loading ? (
          <div className="h-40 animate-pulse rounded-md bg-surface-sunken" />
        ) : revenueByDay.length === 0 ? (
          <p className="body-md text-ink-faint">No paid orders in this range yet.</p>
        ) : (
          <div className="flex h-40 items-end gap-2 overflow-x-auto pb-1">
            {revenueByDay.map((day) => (
              <div key={day.date} className="flex min-w-[2.5rem] flex-1 flex-col items-center gap-1.5">
                <span className="label-sm text-ink-secondary">Rs {Math.round(Number(day.revenue))}</span>
                <div
                  className="w-full rounded-t-sm bg-brand"
                  style={{ height: `${Math.max(6, (Number(day.revenue) / maxDayRevenue) * 100)}px` }}
                />
                <span className="label-sm text-ink-faint">{day.date.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard icon={<IconReceipt />} title="Top sellers" description="Best-selling menu items in this range.">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-surface-sunken" />
              ))}
            </div>
          ) : topItems.length === 0 ? (
            <p className="body-md text-ink-faint">No paid orders in this range yet.</p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="label-sm border-b border-border-subtle text-ink-secondary">
                  <th className="py-2 pr-4">Item</th>
                  <th className="py-2 pr-4">Sold</th>
                  <th className="py-2 pr-0 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((item) => (
                  <tr key={item.menuItemId} className="border-b border-border-subtle last:border-0">
                    <td className="py-3 pr-4 body-md font-medium text-ink-primary">{item.name}</td>
                    <td className="py-3 pr-4 body-md text-ink-secondary">{item.quantitySold}</td>
                    <td className="py-3 pr-0 text-right body-md text-ink-secondary">Rs {item.revenue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <SectionCard icon={<IconBanknote />} title="Payment methods" description="How customers paid in this range.">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-surface-sunken" />
              ))}
            </div>
          ) : paymentMethods.length === 0 ? (
            <p className="body-md text-ink-faint">No paid orders in this range yet.</p>
          ) : (
            <div className="space-y-3">
              {paymentMethods.map((m) => {
                const pct = Math.round((Number(m.amount) / totalMethodAmount) * 100);
                return (
                  <div key={m.method}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="body-md flex items-center gap-1.5 font-medium text-ink-primary">
                        <IconQrCode className="h-3.5 w-3.5 text-ink-faint" />
                        {METHOD_LABELS[m.method] ?? m.method}
                      </span>
                      <span className="label-sm text-ink-secondary">
                        Rs {m.amount} · {m.count} order{m.count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-pill bg-surface-sunken">
                      <div className="h-full rounded-pill bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
