"use client";

// Staff notification centre (admin header, Tables/Billing nav bar, waiter
// order screen).
//
// Source of truth is the server: every notification is saved
// (GET /notifications, last 24h) and pushed live over the socket as a
// "notification" event. So a screen that was closed, asleep or showing
// another page catches up the moment it loads, reconnects or comes back
// into view -- nothing depends on having been listening at the time.
//
// Read/unread is per staff member per device: the highest id they've seen
// is kept in localStorage. Sound and the pop-up card fire once per
// notification even with several tabs open.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCafeSocket, chime } from "../lib/useCafeSocket";
import { apiFetchJson, getCurrentUser } from "../lib/api";
import { tableLabel } from "../lib/format";
import { IconAlert, IconBell, IconCheck, IconFlame, IconHand, IconInfo, IconQrCode, IconReceipt, IconSound, IconUndo, IconX, IconXCircle } from "./icons";

type Type =
  | "qr_order" | "call_waiter" | "request_bill" | "ready" | "recalled" | "sent" | "voided"
  | "cancel_request" | "cancel_approved" | "cancel_rejected";
type Row = {
  id: number;
  type: Type;
  orderId: number | null;
  tableNumber: string | null;
  data: {
    items?: string[]; count?: number; waiter?: string | null; cookSecs?: number | null; reason?: string;
    requestId?: number; requestedBy?: string; decidedBy?: string;
  } | null;
  createdAt: string;
};

const ADMIN_ONLY: Type[] = ["sent", "voided", "cancel_request"];

// label: the category, in the status colour. beeps: 0 = silent (log only).
const META: Record<Type, { label: string; icon: typeof IconBell; text: string; dot: string; beeps: number }> = {
  qr_order: { label: "New QR order", icon: IconQrCode, text: "text-status-info-ink", dot: "bg-status-info", beeps: 2 },
  call_waiter: { label: "Waiter requested", icon: IconHand, text: "text-status-warning-ink", dot: "bg-status-warning", beeps: 3 },
  request_bill: { label: "Bill requested", icon: IconReceipt, text: "text-status-warning-ink", dot: "bg-status-warning", beeps: 3 },
  ready: { label: "Ready for pickup", icon: IconCheck, text: "text-status-success-ink", dot: "bg-status-success", beeps: 1 },
  recalled: { label: "Recalled by kitchen", icon: IconUndo, text: "text-status-danger-ink", dot: "bg-status-danger", beeps: 2 },
  sent: { label: "Sent to kitchen", icon: IconFlame, text: "text-ink-secondary", dot: "bg-ink-faint", beeps: 0 },
  voided: { label: "Item voided", icon: IconX, text: "text-status-danger-ink", dot: "bg-status-danger", beeps: 0 },
  cancel_request: { label: "Cancellation request", icon: IconAlert, text: "text-status-warning-ink", dot: "bg-status-warning", beeps: 3 },
  cancel_approved: { label: "Order cancelled", icon: IconXCircle, text: "text-status-danger-ink", dot: "bg-status-danger", beeps: 2 },
  cancel_rejected: { label: "Cancellation declined", icon: IconInfo, text: "text-ink-secondary", dot: "bg-ink-faint", beeps: 1 },
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const duration = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);
const clockTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function ago(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return "Just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

/** Everything a row shows, worded for staff on the floor. */
function describe(n: Row) {
  const d = n.data ?? {};
  const where = n.tableNumber ? tableLabel(n.tableNumber) : "Table";
  const title = n.orderId ? `${where} · Order #${n.orderId}` : where;
  const items = d.items?.join(", ");
  const by = d.waiter ? ` · ${d.waiter}` : "";
  switch (n.type) {
    case "qr_order":
      return { title, detail: items, meta: `${plural(d.count ?? d.items?.length ?? 0, "item")} · awaiting staff confirmation`, action: "Review order", href: `/order/${n.orderId}` };
    case "call_waiter":
      return { title, detail: "Customer is asking for assistance at the table.", meta: undefined, action: "Open tables", href: "/" };
    case "request_bill":
      return { title, detail: "Customer is ready to pay.", meta: undefined, action: "Open billing", href: "/billing" };
    case "ready":
      return { title, detail: items, meta: `${d.cookSecs != null ? `Prepared in ${duration(d.cookSecs)}` : "Prepared"}${by}`, action: "View order", href: `/order/${n.orderId}` };
    case "recalled":
      return { title, detail: items, meta: "Hold service — returned to the kitchen", action: "View order", href: `/order/${n.orderId}` };
    case "sent":
      return { title, detail: items, meta: `${plural(d.count ?? 0, "item")}${by}`, action: "Open kitchen", href: "/kitchen" };
    case "voided":
      return { title, detail: items, meta: d.reason ? `Reason: ${d.reason}` : undefined, action: "View order", href: `/order/${n.orderId}` };
    case "cancel_request":
      return { title, detail: `Reason: ${d.reason ?? "—"}`, meta: `Requested by ${d.requestedBy ?? "staff"} · needs admin approval`, action: "Review in kitchen", href: "/kitchen" };
    case "cancel_approved":
      return { title, detail: "Stop preparing — this order has been cancelled.", meta: `${d.reason ? `Reason: ${d.reason} · ` : ""}Approved by ${d.decidedBy ?? "admin"}`, action: "Open kitchen", href: "/kitchen" };
    case "cancel_rejected":
      return { title, detail: "Continue preparing — the order stands.", meta: `Declined by ${d.decidedBy ?? "admin"}`, action: "View order", href: `/order/${n.orderId}` };
  }
}

function readNum(key: string) {
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) ? v : 0;
}

export function NotificationBell({ authReady }: { authReady: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<{ id: number; cafeId: number; role: string } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [seen, setSeen] = useState(0);
  const [cleared, setCleared] = useState(0);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [sound, setSound] = useState(true);
  const [popup, setPopup] = useState<Row | null>(null);
  const [, setTick] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cancel requests decided from this screen (before the server's
  // "approved/declined" notification arrives), and any error.
  const [decided, setDecided] = useState<Record<number, "approved" | "rejected" | "busy">>({});
  const [decideError, setDecideError] = useState<string | null>(null);

  const keys = useMemo(() => (user ? {
    seen: `notifSeen:${user.cafeId}:${user.id}`,
    cleared: `notifCleared:${user.cafeId}:${user.id}`,
    beeped: `notifBeeped:${user.cafeId}`,
  } : null), [user]);

  useEffect(() => {
    const u = getCurrentUser();
    if (u) setUser({ id: u.id, cafeId: u.cafeId, role: u.role });
    setSound(localStorage.getItem("notifSound") !== "0");
  }, []);

  useEffect(() => {
    if (!keys) return;
    setSeen(readNum(keys.seen));
    setCleared(readNum(keys.cleared));
    // Another tab marked things read / cleared.
    const onStorage = (e: StorageEvent) => {
      if (e.key === keys.seen) setSeen(readNum(keys.seen));
      if (e.key === keys.cleared) setCleared(readNum(keys.cleared));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [keys]);

  const merge = useCallback((incoming: Row[]) => {
    setRows((prev) => {
      const byId = new Map(prev.map((r) => [r.id, r]));
      for (const r of incoming) byId.set(r.id, r);
      return [...byId.values()].sort((a, b) => b.id - a.id).slice(0, 50);
    });
  }, []);

  // Catch up from the server: on load, on reconnect, and whenever the
  // screen comes back into view (phone unlocked, tab switched back).
  const load = useCallback(async () => {
    try { merge(await apiFetchJson<Row[]>("/notifications")); } catch { /* offline -- the next catch-up fills it in */ }
  }, [merge]);

  const { connected } = useCafeSocket(authReady && !!user, {
    notification: (row: Row) => {
      if (!user || !keys) return;
      if (user.role !== "admin" && ADMIN_ONLY.includes(row.type)) return;
      merge([row]);
      // One beep + pop-up per notification, even with several tabs open.
      if (row.id <= readNum(keys.beeped)) return;
      localStorage.setItem(keys.beeped, String(row.id));
      const m = META[row.type];
      if (!m?.beeps) return;
      if (localStorage.getItem("notifSound") !== "0") chime(m.beeps);
      setPopup(row);
      if (popupTimer.current) clearTimeout(popupTimer.current);
      popupTimer.current = setTimeout(() => setPopup(null), 8000);
    },
  });

  useEffect(() => {
    if (!authReady || !user) return;
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", load);
    const tick = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", load);
      clearInterval(tick);
    };
  }, [authReady, user, load]);

  // Reconnected after a drop -> fetch what happened meanwhile.
  useEffect(() => { if (connected && user) load(); }, [connected, user, load]);
  useEffect(() => () => { if (popupTimer.current) clearTimeout(popupTimer.current); }, []);

  // A cancel request still needs a decision if nobody has answered it yet.
  const answered = useMemo(() => {
    const ids = new Set<number>();
    for (const r of rows) if ((r.type === "cancel_approved" || r.type === "cancel_rejected") && r.data?.requestId) ids.add(r.data.requestId);
    return ids;
  }, [rows]);
  const needsDecision = (r: Row) =>
    user?.role === "admin" && r.type === "cancel_request" && !!r.data?.requestId && !answered.has(r.data.requestId) && !decided[r.data.requestId];

  async function decide(r: Row, approve: boolean) {
    const id = r.data?.requestId;
    if (!id) return;
    setDecideError(null);
    setDecided((d) => ({ ...d, [id]: "busy" }));
    try {
      await apiFetchJson(`/cancel-requests/${id}/${approve ? "approve" : "reject"}`, { method: "POST" });
      setDecided((d) => ({ ...d, [id]: approve ? "approved" : "rejected" }));
      if (popup?.id === r.id) setPopup(null);
    } catch (e) {
      setDecided((d) => { const n = { ...d }; delete n[id]; return n; });
      setDecideError(e instanceof Error ? e.message : "Could not save the decision -- try again.");
      load();
    }
  }

  const visible = rows.filter((r) => r.id > cleared);
  const unreadRows = visible.filter((r) => r.id > seen);
  const unread = unreadRows.length;
  const shown = filter === "unread" ? unreadRows : visible;

  // "(2) Aaramva POS" in the browser tab, visible from other tabs.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, "");
    document.title = unread ? `(${unread > 9 ? "9+" : unread}) ${base}` : base;
  }, [unread]);

  const markAllRead = useCallback(() => {
    if (!keys || !rows.length) return;
    const top = Math.max(seen, rows[0]!.id);
    localStorage.setItem(keys.seen, String(top));
    setSeen(top);
  }, [keys, rows, seen]);

  const close = useCallback(() => { setOpen(false); markAllRead(); }, [markAllRead]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close]);

  function go(r: Row) {
    setPopup(null);
    setOpen(false);
    markAllRead();
    router.push(describe(r).href);
  }

  function clearAll() {
    if (!keys || !rows.length) return;
    localStorage.setItem(keys.cleared, String(rows[0]!.id));
    setCleared(rows[0]!.id);
    markAllRead();
  }

  function toggleSound() {
    const v = !sound;
    setSound(v);
    localStorage.setItem("notifSound", v ? "1" : "0");
    if (v) chime(1);
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Notifications${unread ? ` — ${unread} new` : ""}`}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-secondary transition hover:bg-surface-sunken hover:text-ink-primary"
      >
        <IconBell />
        {unread > 0 && (
          <span className="tabular absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-semibold text-white ring-2 ring-surface-raised">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Live pop-up for anything that needs someone to act */}
      {popup && !open && (() => {
        const m = META[popup.type];
        const d = describe(popup);
        return (
          <div role="status" aria-live="assertive" className="fixed inset-x-3 top-3 z-[70] mx-auto max-w-sm sm:left-auto sm:right-5 sm:mx-0 sm:w-96">
            <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-raised shadow-2xl">
              <div className="flex items-start gap-3 p-4">
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken ${m.text}`}><m.icon className="h-[18px] w-[18px]" /></span>
                <div className="min-w-0 flex-1">
                  <p className={`text-[11px] font-semibold uppercase tracking-wider ${m.text}`}>{m.label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink-primary">{d.title}</p>
                  {d.detail && <p className="mt-0.5 line-clamp-2 text-sm text-ink-secondary">{d.detail}</p>}
                  {d.meta && <p className="mt-1 text-xs text-ink-faint">{d.meta}</p>}
                </div>
                <button type="button" aria-label="Dismiss" onClick={() => setPopup(null)} className="-mr-1 -mt-1 rounded-md p-1.5 text-ink-faint hover:bg-surface-sunken hover:text-ink-secondary"><IconX className="h-4 w-4" /></button>
              </div>
              {needsDecision(popup) ? (
                <div className="grid grid-cols-2 border-t border-border-subtle">
                  <button type="button" onClick={() => decide(popup, false)} className="border-r border-border-subtle py-2.5 text-sm font-semibold text-ink-secondary hover:bg-surface-sunken">Decline</button>
                  <button type="button" onClick={() => decide(popup, true)} className="py-2.5 text-sm font-semibold text-status-danger-ink hover:bg-status-danger-tint">Approve cancellation</button>
                </div>
              ) : (
                <div className="flex border-t border-border-subtle">
                  <button type="button" onClick={() => go(popup)} className="flex-1 py-2.5 text-sm font-semibold text-brand-strong hover:bg-surface-sunken">{d.action}</button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Phones: a dimmed backdrop + full-width sheet under the header, so
          the panel never runs off-screen wherever the bell sits. */}
      {open && <div className="fixed inset-0 z-40 bg-black/25 sm:hidden" aria-hidden />}
      {open && (
        <div ref={panelRef} role="dialog" aria-label="Notifications"
          className="fixed inset-x-2 top-16 z-50 flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:max-h-[min(36rem,80vh)] sm:w-[26rem] sm:rounded-xl">
          <div className="border-b border-border-subtle px-4 pb-2 pt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <p className="text-base font-semibold text-ink-primary sm:text-[15px]">Notifications</p>
                {unread > 0 && <span className="text-xs font-medium text-ink-secondary">{unread} unread</span>}
              </div>
              <div className="flex items-center gap-0.5">
                <span className="mr-1.5 flex items-center gap-1.5 text-[11px] text-ink-faint" title={connected ? "Receiving live updates" : "Reconnecting — will catch up automatically"}>
                  <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-status-success" : "animate-pulse bg-status-warning"}`} />
                  {connected ? "Live" : "Reconnecting"}
                </span>
                <button type="button" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? "Mute sounds" : "Turn sounds on"} title={sound ? "Sound on" : "Sound off"}
                  className={`rounded-md p-2 hover:bg-surface-sunken sm:p-1.5 ${sound ? "text-ink-secondary" : "text-ink-faint opacity-50"}`}>
                  <IconSound className="h-4 w-4" />
                </button>
                <button type="button" onClick={close} aria-label="Close notifications" className="rounded-md p-2 text-ink-faint hover:bg-surface-sunken sm:hidden">
                  <IconX className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex gap-1 text-xs font-medium">
                {(["all", "unread"] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                    className={`rounded-md px-2.5 py-1 ${filter === f ? "bg-surface-sunken text-ink-primary" : "text-ink-faint hover:text-ink-secondary"}`}>
                    {f === "all" ? "All" : "Unread"}
                  </button>
                ))}
              </div>
              {unread > 0 && <button type="button" onClick={markAllRead} className="text-xs font-medium text-brand-strong hover:underline">Mark all as read</button>}
            </div>
          </div>

          {decideError && <p role="alert" className="border-b border-border-subtle bg-status-danger-tint px-4 py-2 text-xs font-medium text-status-danger-ink">{decideError}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {shown.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <IconBell className="mx-auto h-6 w-6 text-ink-faint" />
                <p className="mt-2 text-sm font-medium text-ink-secondary">{filter === "unread" ? "You're all caught up" : "No notifications in the last 24 hours"}</p>
                <p className="mt-1 text-xs text-ink-faint">QR orders, waiter calls, bill requests and kitchen updates appear here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {shown.map((r) => {
                  const m = META[r.type];
                  if (!m) return null;
                  const d = describe(r);
                  const isNew = r.id > seen;
                  return (
                    <li key={r.id} className="relative">
                      <button type="button" onClick={() => go(r)} className="relative flex w-full gap-3 px-4 py-3.5 text-left transition hover:bg-surface-sunken sm:py-3">
                        {isNew && <span className="absolute inset-y-0 left-0 w-[3px] bg-brand" aria-hidden />}
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken ${m.text}`}><m.icon className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${m.text}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} aria-hidden />{m.label}
                            </span>
                            <span className="tabular shrink-0 whitespace-nowrap text-[11px] text-ink-faint" title={new Date(r.createdAt).toLocaleString()}>{clockTime(r.createdAt)}<span className="hidden min-[380px]:inline"> · {ago(r.createdAt)}</span></span>
                          </span>
                          <span className={`mt-0.5 block text-sm text-ink-primary ${isNew ? "font-semibold" : "font-medium"}`}>{d.title}</span>
                          {d.detail && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-ink-secondary">{d.detail}</span>}
                          {d.meta && <span className="mt-1 block text-xs text-ink-faint">{d.meta}</span>}
                        </span>
                      </button>
                      {r.type === "cancel_request" && user?.role === "admin" && r.data?.requestId && (
                        <div className="flex gap-2 px-4 pb-3 pl-[60px]">
                          {needsDecision(r) ? (
                            <>
                              <button type="button" onClick={() => decide(r, true)} className="rounded-lg bg-status-danger px-3 py-2 text-xs font-semibold text-white hover:brightness-95">Approve cancellation</button>
                              <button type="button" onClick={() => decide(r, false)} className="rounded-lg border border-border-subtle px-3 py-2 text-xs font-semibold text-ink-secondary hover:bg-surface-sunken">Decline</button>
                            </>
                          ) : decided[r.data.requestId] === "busy" ? (
                            <span className="text-xs text-ink-faint">Saving…</span>
                          ) : (
                            <span className="text-xs font-medium text-ink-faint">
                              {decided[r.data.requestId] === "approved" || rows.some((x) => x.type === "cancel_approved" && x.data?.requestId === r.data?.requestId) ? "Approved — order cancelled" : "Declined"}
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {visible.length > 0 && (
            <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2 text-[11px] text-ink-faint">
              <span>Last 24 hours · {plural(visible.length, "notification")}</span>
              <button type="button" onClick={clearAll} className="font-medium hover:text-ink-secondary">Clear</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
