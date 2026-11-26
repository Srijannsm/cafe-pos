"use client";

// Kitchen display (KDS). The server (GET /orders/kitchen) already shapes the
// board into tickets -- one per "round" sent to the kitchen -- so this page
// only renders and handles taps. Desktop/tablet-landscape: tickets on the
// left, a "Ready for pickup" lane + all-day totals on the right. Phones and
// portrait tablets: the same three views behind a segmented control.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetchJson } from "../../lib/api";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { useCafeSocket, chime } from "../../lib/useCafeSocket";
import { useCafeSettings } from "../../lib/CafeSettingsContext";
import { IconChevronLeft, IconSound, IconCheck, IconUndo, IconQrCode, IconTruck, IconClock, IconFlame, IconBell, IconBarChart } from "../../components/icons";
import { tableLabel } from "../../lib/format";

type Station = "kitchen" | "bar" | "hookah";
type View = "cooking" | "ready" | "allday";
type KdsItem = {
  id: number; quantity: number; name: string; modifiers: string[]; note: string | null;
  station: Station; status: "pending" | "ready" | "served"; voided: boolean; readyAt: string | null;
};
type KdsTicket = {
  key: string; orderId: number; round: number; table: string; orderType: "dine_in" | "takeaway"; source: "staff" | "qr";
  waiter: string | null; notes: string | null; sentAt: string; readyAt: string | null; items: KdsItem[]; orderAllReady: boolean;
};
type Board = {
  now: string; cooking: KdsTicket[]; ready: KdsTicket[];
  counts: Record<Station | "all", number>;
  allDay: { name: string; quantity: number }[];
  stats: { ticketsDone: number; itemsDone: number; avgTicketSecs: number | null };
};

// Minutes after which a ticket turns amber / red. Drinks should be quicker than food.
const LIMITS: Record<Station, [number, number]> = { kitchen: [10, 15], bar: [5, 8], hookah: [8, 12] };
const STATIONS: { value: Station | "all"; label: string }[] = [
  { value: "all", label: "All" }, { value: "kitchen", label: "Kitchen" }, { value: "bar", label: "Bar" }, { value: "hookah", label: "Hookah" },
];

const isActive = (i: KdsItem) => i.status === "pending" && !i.voided;

/** 4:05 under an hour, 1h 05m after. */
function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const mins = (secs: number | null) => (secs == null ? "—" : secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}m`);

/** Timing limits for a ticket: a drinks-only ticket uses the bar's tighter limits. */
function limitsFor(t: KdsTicket): [number, number] {
  const st = new Set(t.items.filter(isActive).map((i) => i.station));
  return st.size === 1 ? LIMITS[[...st][0]!] : LIMITS.kitchen;
}

export default function KitchenDisplay() {
  const ready = useRequireAuth();
  const { settings } = useCafeSettings();
  const [board, setBoard] = useState<Board | null>(null);
  const [station, setStation] = useState<Station | "all">("all");
  const [view, setView] = useState<View>("cooking");
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(true);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const known = useRef<Set<string> | null>(null);
  const skew = useRef(0); // server clock minus this device's clock
  const stationRef = useRef(station);
  stationRef.current = station;

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("station") as Station | null;
    if (s && LIMITS[s]) setStation(s);
    setSound(localStorage.getItem("kdsSound") !== "0");
  }, []);

  const load = useCallback(async () => {
    const st = stationRef.current;
    const tz = -new Date().getTimezoneOffset();
    try {
      const b = await apiFetchJson<Board>(`/orders/kitchen?tz=${tz}${st === "all" ? "" : `&station=${st}`}`);
      if (st !== stationRef.current) return; // station changed mid-flight
      skew.current = new Date(b.now).getTime() - Date.now();
      // Flash + chime for tickets we haven't seen before (not on first paint).
      const keys = new Set(b.cooking.map((t) => t.key));
      if (known.current) {
        const added = [...keys].filter((k) => !known.current!.has(k));
        if (added.length) {
          if (localStorage.getItem("kdsSound") !== "0") chime(3);
          setFresh((f) => new Set([...f, ...added]));
          setTimeout(() => setFresh((f) => new Set([...f].filter((k) => !added.includes(k)))), 8000);
        }
      }
      known.current = new Set([...(known.current ?? []), ...keys]);
      setBoard(b);
      setError(null);
    } catch {
      setError("Can't reach the server — showing the last board.");
    }
  }, []);

  const { connected } = useCafeSocket(ready, {
    "order.sentToKitchen": () => load(),
    "order.itemVoided": () => { if (localStorage.getItem("kdsSound") !== "0") chime(2); load(); },
    "order.itemReady": () => load(),
    "floor.changed": () => load(),
  });

  useEffect(() => {
    if (!ready) return;
    load();
    const poll = setInterval(load, connected ? 30000 : 6000);
    return () => clearInterval(poll);
  }, [ready, load, connected, station]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Keep the tablet screen on during service.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const get = () => nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    get();
    const onVis = () => document.visibilityState === "visible" && get();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release().catch(() => {}); };
  }, []);

  const serverNow = now + skew.current;
  const cooking = board?.cooking ?? [];
  const readyLane = board?.ready ?? [];
  const itemsToMake = cooking.reduce((n, t) => n + t.items.filter(isActive).reduce((a, i) => a + i.quantity, 0), 0);
  const longest = cooking.length ? serverNow - Math.min(...cooking.map((t) => new Date(t.sentAt).getTime())) : 0;
  const lateCount = cooking.filter((t) => serverNow - new Date(t.sentAt).getTime() >= limitsFor(t)[1] * 60000).length;

  // Optimistic local edit, then re-read the board from the server.
  function patchItems(ids: number[], status: "ready" | "pending") {
    setBoard((b) => b && ({
      ...b,
      cooking: b.cooking.map((t) => ({ ...t, items: t.items.map((i) => (ids.includes(i.id) ? { ...i, status } : i)) })),
    }));
  }

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy((b) => new Set(b).add(key));
    try { await fn(); } catch { setError("That didn't save — try again."); }
    setBusy((b) => { const n = new Set(b); n.delete(key); return n; });
    load();
  }

  const markReady = (key: string, ids: number[]) => {
    if (!ids.length) return;
    patchItems(ids, "ready");
    return run(key, () => apiFetchJson("/orders/items/ready", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }));
  };
  const recall = (key: string, ids: number[]) => {
    patchItems(ids, "pending");
    return run(key, () => Promise.all(ids.map((id) => apiFetchJson(`/orders/items/${id}/recall`, { method: "PATCH" }))));
  };
  const pickedUp = (t: KdsTicket) => run(t.key, () => apiFetchJson(`/orders/${t.orderId}/serve`, { method: "PATCH" }));

  function chooseStation(s: Station | "all") {
    setStation(s);
    stationRef.current = s;
    known.current = null; // don't chime for tickets that were just hidden by the filter
    window.history.replaceState(null, "", s === "all" ? "/kitchen" : `/kitchen?station=${s}`);
    load();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  const counts = board?.counts;

  return (
    <main data-theme="dark" className="flex h-[100dvh] flex-col bg-surface-canvas text-ink-primary">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-border-subtle bg-surface-raised">
        <div className="flex items-center gap-2 px-2 py-2 sm:gap-3 sm:px-3">
          <Link href="/" aria-label="Back" className="rounded-lg p-2 text-ink-secondary hover:bg-surface-sunken"><IconChevronLeft className="h-5 w-5" /></Link>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight sm:text-base">{settings?.name ?? "Kitchen"}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-status-success" : "animate-pulse bg-status-danger"}`} />
              {connected ? "Live" : "Reconnecting…"}
            </p>
          </div>
          <div className="flex-1" />
          <button type="button" aria-label={sound ? "Mute" : "Unmute"} aria-pressed={sound} onClick={() => { const v = !sound; setSound(v); localStorage.setItem("kdsSound", v ? "1" : "0"); if (v) chime(1); }} className={`rounded-lg p-2.5 ${sound ? "text-ink-primary" : "text-ink-faint opacity-50"}`}>
            <IconSound className="h-5 w-5" />
          </button>
          <button type="button" aria-label="Full screen" onClick={toggleFullscreen} className="hidden rounded-lg p-2.5 text-ink-secondary hover:bg-surface-sunken sm:block">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
          </button>
        </div>

        {/* Station tabs */}
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-2 pb-2 sm:px-3">
          {STATIONS.map((s) => {
            const n = counts?.[s.value] ?? 0;
            const on = station === s.value;
            return (
              <button key={s.value} type="button" onClick={() => chooseStation(s.value)} aria-pressed={on}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${on ? "bg-brand text-on-brand" : "bg-surface-sunken text-ink-secondary hover:text-ink-primary"}`}>
                {s.label}
                {n > 0 && <span className={`tabular min-w-[1.25rem] rounded-full px-1.5 text-center text-xs ${on ? "bg-black/20" : "bg-surface-overlay"}`}>{n}</span>}
              </button>
            );
          })}
        </div>

        {/* Stats strip */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-border-subtle px-2 py-2 sm:px-3">
          <Stat icon={<IconFlame className="h-4 w-4" />} label="Open tickets" value={String(cooking.length)} />
          <Stat icon={<IconBell className="h-4 w-4" />} label="Items to make" value={String(itemsToMake)} />
          <Stat icon={<IconClock className="h-4 w-4" />} label="Longest wait" value={cooking.length ? clock(longest) : "—"} tone={lateCount ? "danger" : undefined} />
          {lateCount > 0 && <Stat label="Late" value={String(lateCount)} tone="danger" />}
          <Stat icon={<IconBarChart className="h-4 w-4" />} label="Avg ticket today" value={mins(board?.stats.avgTicketSecs ?? null)} />
          <Stat icon={<IconCheck className="h-4 w-4" />} label="Done today" value={String(board?.stats.ticketsDone ?? 0)} />
        </div>
      </header>

      {error && <p role="status" className="shrink-0 bg-status-danger-tint px-4 py-2 text-sm font-semibold text-status-danger-ink">{error}</p>}

      {/* Mobile / portrait: segmented control between the three views */}
      <nav className="shrink-0 border-b border-border-subtle bg-surface-raised p-2 lg:hidden">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-sunken p-1">
          {([["cooking", "Cooking", cooking.length], ["ready", "Ready", readyLane.length], ["allday", "All day", null]] as const).map(([v, label, n]) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
              className={`rounded-lg py-2.5 text-sm font-semibold transition ${view === v ? "bg-surface-overlay text-ink-primary shadow" : "text-ink-faint"}`}>
              {label}{n ? <span className="tabular ml-1.5 text-xs opacity-70">{n}</span> : null}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex min-h-0 flex-1">
        {/* ── Cooking ─────────────────────────────────────────── */}
        <section className={`min-w-0 flex-1 overflow-y-auto p-2 sm:p-3 ${view === "cooking" ? "" : "hidden lg:block"}`}>
          {!board ? (
            <p className="p-8 text-center text-ink-faint">Loading tickets…</p>
          ) : cooking.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-ink-faint">
              <IconCheck className="h-12 w-12" />
              <p className="text-lg font-semibold text-ink-secondary">All caught up</p>
              <p className="text-sm">New tickets appear here with a chime.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {cooking.map((t) => (
                <TicketCard key={t.key} t={t} now={serverNow} isNew={fresh.has(t.key)} busy={busy.has(t.key)} showStation={station === "all"}
                  onItem={(i) => (i.status === "ready" ? recall(t.key, [i.id]) : markReady(t.key, [i.id]))}
                  onDone={() => markReady(t.key, t.items.filter(isActive).map((i) => i.id))} />
              ))}
            </div>
          )}
        </section>

        {/* ── Right rail (desktop) / Ready + All day views (mobile) ── */}
        <aside className={`min-h-0 flex-col border-border-subtle bg-surface-raised lg:flex lg:w-80 lg:shrink-0 lg:border-l xl:w-96 ${view === "cooking" ? "hidden" : "flex flex-1"}`}>
          <div className={`min-h-0 flex-1 overflow-y-auto p-3 ${view === "allday" ? "hidden lg:block" : ""}`}>
            <h2 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Ready for pickup <span className="tabular">{readyLane.length}</span>
            </h2>
            {readyLane.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border-subtle p-6 text-center text-sm text-ink-faint">Finished tickets wait here until a waiter picks them up.</p>
            ) : (
              <ul className="space-y-2">
                {readyLane.map((t) => <ReadyCard key={t.key} t={t} now={serverNow} busy={busy.has(t.key)} onRecall={() => recall(t.key, t.items.filter((i) => i.status === "ready").map((i) => i.id))} onPickedUp={() => pickedUp(t)} />)}
              </ul>
            )}
          </div>

          <div className={`min-h-0 overflow-y-auto border-border-subtle p-3 lg:max-h-[45%] lg:shrink-0 lg:border-t ${view === "allday" ? "flex-1" : "hidden lg:block"}`}>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">All day</h2>
            <p className="mb-3 text-xs text-ink-faint">Totals still to make across every open ticket — batch these.</p>
            {(board?.allDay.length ?? 0) === 0 ? <p className="text-sm text-ink-faint">Nothing to make.</p> : (
              <ul className="space-y-1.5">
                {board!.allDay.map((a) => {
                  const max = board!.allDay[0]!.quantity;
                  return (
                    <li key={a.name} className="relative overflow-hidden rounded-lg bg-surface-sunken px-3 py-2">
                      <span className="absolute inset-y-0 left-0 bg-brand/20" style={{ width: `${(a.quantity / max) * 100}%` }} aria-hidden />
                      <span className="relative flex items-center justify-between gap-3 text-base">
                        <span className="truncate font-medium">{a.name}</span>
                        <span className="tabular text-lg font-bold">{a.quantity}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {board && (
              <p className="mt-4 text-xs text-ink-faint">Today: {board.stats.ticketsDone} tickets · {board.stats.itemsDone} items · avg {mins(board.stats.avgTicketSecs)} per ticket</p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function Stat({ icon, label, value, tone }: { icon?: React.ReactNode; label: string; value: string; tone?: "danger" }) {
  return (
    <div className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 ${tone === "danger" ? "bg-status-danger-tint text-status-danger-ink" : "bg-surface-sunken"}`}>
      {icon && <span className={tone ? "" : "text-ink-faint"}>{icon}</span>}
      <span className="text-[11px] uppercase tracking-wide opacity-70">{label}</span>
      <span className="tabular text-sm font-bold">{value}</span>
    </div>
  );
}

function Badges({ t }: { t: KdsTicket }) {
  return (
    <>
      {t.round > 1 && <span className="rounded bg-black/25 px-1.5 py-0.5 text-[11px] font-bold uppercase">Round {t.round}</span>}
      {t.orderType === "takeaway" && <span className="inline-flex items-center gap-1 rounded bg-black/25 px-1.5 py-0.5 text-[11px] font-bold uppercase"><IconTruck className="h-3 w-3" />Takeaway</span>}
      {t.source === "qr" && <span className="inline-flex items-center gap-1 rounded bg-black/25 px-1.5 py-0.5 text-[11px] font-bold uppercase"><IconQrCode className="h-3 w-3" />QR</span>}
    </>
  );
}

function TicketCard({ t, now, isNew, busy, showStation, onItem, onDone }: {
  t: KdsTicket; now: number; isNew: boolean; busy: boolean; showStation: boolean;
  onItem: (i: KdsItem) => void; onDone: () => void;
}) {
  const age = now - new Date(t.sentAt).getTime();
  const [warn, late] = limitsFor(t);
  const m = age / 60000;
  const state = m >= late ? "late" : m >= warn ? "warn" : "ok";
  const head = state === "late" ? "bg-status-danger text-white" : state === "warn" ? "bg-status-warning text-black" : "bg-surface-overlay text-ink-primary";
  const bar = state === "late" ? "bg-white/70" : state === "warn" ? "bg-black/40" : "bg-brand";
  const live = t.items.filter((i) => !i.voided);
  const left = t.items.filter(isActive);
  const doneCount = live.length - left.length;

  return (
    <article className={`flex flex-col overflow-hidden rounded-2xl border-2 bg-surface-raised transition ${isNew ? "border-brand ring-4 ring-brand/30" : state === "late" ? "border-status-danger" : "border-border-subtle"}`}>
      <div className={`relative px-4 pb-3 pt-3 ${head}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-2xl font-bold leading-none">{tableLabel(t.table)}</p>
              {isNew && <span className="animate-pulse rounded bg-brand px-1.5 py-0.5 text-[11px] font-bold uppercase text-on-brand">New</span>}
              <Badges t={t} />
            </div>
            <p className="mt-1 truncate text-xs font-medium opacity-80">{t.waiter ?? "Customer (QR)"} · #{t.orderId}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="tabular text-2xl font-bold leading-none">{clock(age)}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase opacity-80">{state === "late" ? "Late" : state === "warn" ? "Hurry" : "On time"}</p>
          </div>
        </div>
        {/* progress towards the "late" mark */}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/10">
          <div className={`h-full ${bar} transition-[width] duration-1000`} style={{ width: `${Math.min(100, (m / late) * 100)}%` }} />
        </div>
      </div>

      {t.notes && <p className="border-b border-border-subtle bg-status-warning-tint px-4 py-2 text-sm font-semibold text-status-warning-ink">⚠ {t.notes}</p>}

      <ul className="flex-1 divide-y divide-border-subtle">
        {t.items.map((i) => {
          const done = i.status === "ready";
          return (
            <li key={i.id}>
              <button type="button" disabled={i.voided || busy} onClick={() => onItem(i)}
                aria-label={i.voided ? `${i.name} voided` : done ? `${i.name} done — tap to undo` : `Mark ${i.name} done`}
                className={`flex min-h-[56px] w-full items-start gap-3 px-4 py-3 text-left transition active:bg-surface-sunken disabled:cursor-default ${done ? "opacity-50" : ""}`}>
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${i.voided ? "border-status-danger" : done ? "border-status-success bg-status-success text-black" : "border-border-strong"}`}>
                  {done && <IconCheck className="h-4 w-4" />}
                </span>
                <span className={`tabular w-7 shrink-0 text-xl font-bold ${i.voided ? "text-status-danger line-through" : done ? "line-through" : ""}`}>{i.quantity}×</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-lg font-semibold leading-tight ${i.voided ? "text-status-danger line-through" : done ? "line-through" : ""}`}>
                    {i.name}
                    {showStation && i.station !== "kitchen" && <span className="ml-2 rounded bg-surface-sunken px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-ink-faint">{i.station}</span>}
                  </span>
                  {i.voided && <span className="text-xs font-bold uppercase text-status-danger">Void — stop making</span>}
                  {i.modifiers.length > 0 && <span className="block text-sm font-semibold text-brand-strong">+ {i.modifiers.join(", ")}</span>}
                  {i.note && <span className="mt-1 inline-block rounded bg-status-warning px-1.5 py-0.5 text-sm font-semibold text-black">“{i.note}”</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border-subtle p-2">
        <button type="button" onClick={onDone} disabled={busy || left.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-status-success py-3.5 text-base font-bold text-black transition active:scale-[0.99] disabled:opacity-40">
          <IconCheck className="h-5 w-5" />
          {left.length === live.length ? `Done · ${plural(left.reduce((n, i) => n + i.quantity, 0), "item")}` : `Finish ${left.length} left · ${doneCount}/${live.length} done`}
        </button>
      </div>
    </article>
  );
}

function ReadyCard({ t, now, busy, onRecall, onPickedUp }: { t: KdsTicket; now: number; busy: boolean; onRecall: () => void; onPickedUp: () => void }) {
  const waited = t.readyAt ? now - new Date(t.readyAt).getTime() : 0;
  const cook = t.readyAt ? new Date(t.readyAt).getTime() - new Date(t.sentAt).getTime() : null;
  const stale = waited > 5 * 60000; // food going cold on the pass
  const shown = t.items.filter((i) => !i.voided);
  return (
    <li className={`rounded-xl border bg-surface-sunken p-3 ${stale ? "border-status-warning" : "border-border-subtle"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-lg font-bold leading-none">{tableLabel(t.table)}</p>
            <Badges t={t} />
          </div>
          <p className="mt-1 truncate text-xs text-ink-faint">{t.waiter ?? "Customer (QR)"} · #{t.orderId}{cook != null ? ` · cooked in ${clock(cook)}` : ""}</p>
        </div>
        <p className={`tabular shrink-0 text-sm font-bold ${stale ? "text-status-warning" : "text-status-success"}`}>Ready {clock(waited)}</p>
      </div>
      <p className="mt-2 text-sm text-ink-secondary">{shown.map((i) => `${i.quantity}× ${i.name}`).join(" · ")}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onRecall} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-sm font-semibold text-ink-secondary hover:text-ink-primary disabled:opacity-40">
          <IconUndo className="h-4 w-4" />Recall
        </button>
        {t.orderAllReady ? (
          <button type="button" onClick={onPickedUp} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-bold text-on-brand disabled:opacity-40">
            <IconCheck className="h-4 w-4" />Picked up
          </button>
        ) : (
          <span className="flex flex-1 items-center justify-center rounded-lg px-3 py-2 text-center text-xs text-ink-faint">Rest of the order still cooking</span>
        )}
      </div>
    </li>
  );
}
