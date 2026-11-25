"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetchJson } from "../../lib/api";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { useCafeSocket, chime } from "../../lib/useCafeSocket";
import { useCafeSettings } from "../../lib/CafeSettingsContext";
import { IconChevronLeft, IconSound, IconHistory, IconCheck } from "../../components/icons";

type Station = "kitchen" | "bar" | "hookah";
type Item = {
  id: number; quantity: number; status: "pending" | "ready" | "served"; sentToKitchen: boolean; station: Station;
  note: string | null; voidedAt: string | null; createdAt: string;
  menuItem: { name: string }; orderItemModifiers: { modifier: { name: string } }[];
};
type Order = {
  id: number; status: string; orderType: "dine_in" | "takeaway"; source: "staff" | "qr"; notes: string | null; createdAt: string;
  table: { tableNumber: string }; waiter: { name: string } | null; orderItems: Item[];
};
type Ticket = { key: string; order: Order; items: Item[]; pending: Item[]; since: number };

// Minutes after which a ticket turns amber / red, per station -- drinks
// should be quicker than food.
const LIMITS: Record<Station | "all", [number, number]> = { all: [10, 15], kitchen: [10, 15], bar: [5, 8], hookah: [8, 12] };
const STATIONS: { value: Station | "all"; label: string }[] = [
  { value: "all", label: "All" }, { value: "kitchen", label: "Kitchen" }, { value: "bar", label: "Bar" }, { value: "hookah", label: "Hookah" },
];

export default function KitchenDisplay() {
  const ready = useRequireAuth();
  const { settings } = useCafeSettings();
  const [orders, setOrders] = useState<Order[]>([]);
  const [station, setStation] = useState<Station | "all">("all");
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(true);
  const [allDay, setAllDay] = useState(false);
  const [flash, setFlash] = useState<Set<number>>(new Set());
  const [bumped, setBumped] = useState<{ ids: number[]; label: string; at: number }[]>([]);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const known = useRef<Set<number>>(new Set());
  const first = useRef(true);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("station") as Station | null;
    if (s && LIMITS[s]) setStation(s);
    setSound(localStorage.getItem("kdsSound") !== "0");
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await apiFetchJson<Order[]>("/orders?status=preparing");
      // Flash + chime for items we haven't seen before.
      const fresh = new Set<number>();
      for (const o of list) for (const i of o.orderItems) {
        if (i.sentToKitchen && i.status === "pending" && !i.voidedAt && !known.current.has(i.id)) fresh.add(o.id);
        known.current.add(i.id);
      }
      if (!first.current && fresh.size) {
        if (localStorage.getItem("kdsSound") !== "0") chime(3);
        setFlash(fresh);
        setTimeout(() => setFlash(new Set()), 4000);
      }
      first.current = false;
      setOrders(list);
    } catch {
      // keep showing the last board
    }
  }, []);

  const { connected } = useCafeSocket(ready, {
    "order.sentToKitchen": () => load(),
    "order.itemVoided": () => load(),
    "floor.changed": () => load(),
  });

  useEffect(() => {
    if (!ready) return;
    load();
    const poll = setInterval(load, connected ? 30000 : 6000);
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [ready, load, connected]);

  // Keep the tablet screen on during service.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, []);

  const tickets: Ticket[] = useMemo(() => {
    const out: Ticket[] = [];
    for (const o of orders) {
      const sent = o.orderItems.filter((i) => i.sentToKitchen && (station === "all" || i.station === station));
      const pending = sent.filter((i) => i.status === "pending" && !i.voidedAt);
      if (pending.length === 0) continue;
      // Show what's still to make plus voids (struck through) so the cook stops making them.
      const items = sent.filter((i) => (i.status === "pending" || i.voidedAt) && !(i.voidedAt && i.status !== "pending"));
      out.push({ key: `${o.id}-${station}`, order: o, items, pending, since: Math.min(...pending.map((i) => new Date(i.createdAt).getTime())) });
    }
    return out.sort((a, b) => a.since - b.since);
  }, [orders, station]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, kitchen: 0, bar: 0, hookah: 0 };
    for (const o of orders) for (const i of o.orderItems) {
      if (i.sentToKitchen && i.status === "pending" && !i.voidedAt) { c.all! += i.quantity; c[i.station] = (c[i.station] ?? 0) + i.quantity; }
    }
    return c;
  }, [orders]);

  const allDayList = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tickets) for (const i of t.pending) m.set(i.menuItem.name, (m.get(i.menuItem.name) ?? 0) + i.quantity);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [tickets]);

  async function markReady(ids: number[], label: string) {
    setBusy((b) => new Set([...b, ...ids]));
    // Optimistic: strike them immediately.
    setOrders((os) => os.map((o) => ({ ...o, orderItems: o.orderItems.map((i) => (ids.includes(i.id) ? { ...i, status: "ready" as const } : i)) })));
    await Promise.all(ids.map((id) => apiFetchJson(`/orders/items/${id}/ready`, { method: "PATCH" }).catch(() => {})));
    setBumped((b) => [{ ids, label, at: Date.now() }, ...b].slice(0, 10));
    setBusy((b) => new Set([...b].filter((x) => !ids.includes(x))));
    load();
  }

  async function recall(entry: { ids: number[] }) {
    await Promise.all(entry.ids.map((id) => apiFetchJson(`/orders/items/${id}/recall`, { method: "PATCH" }).catch(() => {})));
    setBumped((b) => b.filter((x) => x !== entry));
    load();
  }

  function setStationUrl(s: Station | "all") {
    setStation(s);
    window.history.replaceState(null, "", s === "all" ? "/kitchen" : `/kitchen?station=${s}`);
  }

  const [warn, late] = LIMITS[station];

  return (
    <main data-theme="dark" className="flex h-[100dvh] flex-col bg-surface-canvas text-ink-primary">
      <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-surface-raised px-3 py-2.5">
        <Link href="/" aria-label="Back" className="rounded-lg p-2 text-ink-secondary hover:bg-surface-sunken"><IconChevronLeft className="h-5 w-5" /></Link>
        <p className="hidden font-semibold sm:block">{settings?.name ?? "Kitchen"}</p>
        <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-surface-sunken p-1">
          {STATIONS.map((s) => (
            <button key={s.value} type="button" onClick={() => setStationUrl(s.value)} className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${station === s.value ? "bg-surface-overlay text-ink-primary" : "text-ink-faint"}`}>
              {s.label} {counts[s.value] ? <span className="tabular ml-1 rounded-full bg-brand px-1.5 text-xs text-on-brand">{counts[s.value]}</span> : null}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {!connected && <span className="rounded-full bg-status-danger px-3 py-1 text-xs font-semibold text-white">Offline — reconnecting</span>}
        <button type="button" onClick={() => setAllDay((a) => !a)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${allDay ? "bg-brand text-on-brand" : "text-ink-secondary hover:bg-surface-sunken"}`}>All day</button>
        <button type="button" aria-label="Sound" onClick={() => { const v = !sound; setSound(v); localStorage.setItem("kdsSound", v ? "1" : "0"); if (v) chime(1); }} className={`rounded-lg p-2 ${sound ? "text-ink-primary" : "text-ink-faint line-through"}`}>
          <IconSound className="h-5 w-5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex-1 overflow-y-auto p-3">
          {tickets.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-faint">
              <IconCheck className="h-10 w-10" />
              <p className="text-lg font-semibold">All caught up</p>
              <p className="text-sm">New tickets appear here with a chime.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {tickets.map((t) => {
                const mins = Math.floor((now - t.since) / 60000);
                const tone = mins >= late ? "bg-status-danger text-white" : mins >= warn ? "bg-status-warning text-black" : "bg-surface-overlay text-ink-primary";
                return (
                  <article key={t.key} className={`flex flex-col overflow-hidden rounded-2xl border-2 bg-surface-raised ${flash.has(t.order.id) ? "animate-pulse border-brand" : "border-border-subtle"}`}>
                    <button type="button" onClick={() => markReady(t.pending.map((i) => i.id), `T${t.order.table.tableNumber}`)} className={`flex items-center justify-between px-4 py-3 text-left ${tone}`} title="Tap to bump the whole ticket">
                      <div>
                        <p className="text-2xl font-bold leading-none">{t.order.orderType === "takeaway" ? "TA" : "T"}{t.order.table.tableNumber}</p>
                        <p className="mt-1 text-xs font-medium opacity-80">{t.order.waiter?.name ?? "QR"} · #{t.order.id}{t.order.orderType === "takeaway" ? " · TAKEAWAY" : ""}</p>
                      </div>
                      <div className="text-right">
                        <p className="tabular text-xl font-bold">{mins}m</p>
                        <p className="text-[11px] font-semibold uppercase opacity-80">Bump ✓</p>
                      </div>
                    </button>
                    {t.order.notes && <p className="border-b border-border-subtle bg-status-warning-tint px-4 py-2 text-sm font-semibold text-status-warning-ink">⚠ {t.order.notes}</p>}
                    <ul className="flex-1 divide-y divide-border-subtle">
                      {t.items.map((i) => (
                        <li key={i.id}>
                          <button
                            type="button"
                            disabled={!!i.voidedAt || busy.has(i.id)}
                            onClick={() => markReady([i.id], `${i.quantity}× ${i.menuItem.name}`)}
                            className="flex w-full items-start gap-3 px-4 py-3 text-left transition active:bg-surface-sunken disabled:cursor-default"
                          >
                            <span className={`tabular text-xl font-bold ${i.voidedAt ? "text-status-danger line-through" : ""}`}>{i.quantity}</span>
                            <span className="min-w-0 flex-1">
                              <span className={`block text-lg font-semibold leading-tight ${i.voidedAt ? "text-status-danger line-through" : ""}`}>{i.menuItem.name}</span>
                              {i.voidedAt && <span className="text-xs font-bold uppercase text-status-danger">Void — stop</span>}
                              {i.orderItemModifiers.length > 0 && <span className="block text-sm font-semibold text-brand-strong">+ {i.orderItemModifiers.map((m) => m.modifier.name).join(", ")}</span>}
                              {i.note && <span className="mt-1 inline-block rounded bg-status-warning px-1.5 py-0.5 text-sm font-semibold text-black">{i.note}</span>}
                              {station === "all" && i.station !== "kitchen" && <span className="ml-1 text-xs uppercase text-ink-faint">{i.station}</span>}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {(allDay || bumped.length > 0) && (
          <aside className="hidden w-72 shrink-0 flex-col border-l border-border-subtle bg-surface-raised md:flex">
            {allDay && (
              <div className="border-b border-border-subtle p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">All day</p>
                {allDayList.length === 0 ? <p className="text-sm text-ink-faint">Nothing open.</p> : (
                  <ul className="space-y-2">{allDayList.map(([n, q]) => <li key={n} className="flex justify-between text-base"><span className="truncate">{n}</span><span className="tabular font-bold">{q}</span></li>)}</ul>
                )}
              </div>
            )}
            {bumped.length > 0 && (
              <div className="flex-1 overflow-y-auto p-4">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint"><IconHistory className="h-3.5 w-3.5" />Recently done</p>
                <ul className="space-y-2">
                  {bumped.map((b) => (
                    <li key={b.at} className="flex items-center justify-between gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-sm">
                      <span className="truncate">{b.label}</span>
                      <button type="button" onClick={() => recall(b)} className="shrink-0 text-xs font-semibold text-brand-strong">Recall</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
