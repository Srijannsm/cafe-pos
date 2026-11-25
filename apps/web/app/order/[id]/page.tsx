"use client";

import { useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, apiFetchJson } from "../../../lib/api";
import { useRequireAuth } from "../../../lib/useRequireAuth";
import { useCafeSocket } from "../../../lib/useCafeSocket";
import { useToast } from "../../../components/Toast";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Sheet } from "../../../components/ui/Sheet";
import { Skeleton } from "../../../components/ui/Skeleton";
import { ErrorState } from "../../../components/ui/ErrorState";
import { ItemSheet, type SheetItem } from "../../../components/order/ItemSheet";
import { VoidDialog } from "../../../components/order/VoidDialog";
import { IconChevronLeft, IconSearch, IconX, IconTrash, IconCheck, IconFlame, IconUndo } from "../../../components/icons";
import { assetUrl, rs, timeAgo } from "../../../lib/format";
import { type Category, type Station } from "../../../lib/menu-types";

type Mod = { id: number; name: string; priceDelta: string };
type MenuItem = {
  id: number; name: string; price: string; description: string | null; imageUrl: string | null; tags: string[];
  isAvailable: boolean; categoryId: number; category: { id: number; name: string; parentId: number | null };
  modifiers: Mod[]; trackStock: boolean; stockQuantity: number; station: Station;
};
type Line = {
  id: number; quantity: number; price: string; status: "pending" | "ready" | "served"; sentToKitchen: boolean;
  note: string | null; voidedAt: string | null; voidReason: string | null; createdAt: string;
  menuItem: { id: number; name: string }; orderItemModifiers: { id: number; modifier: Mod }[];
};
type Order = {
  id: number; status: "pending" | "preparing" | "served" | "billed" | "paid" | "cancelled"; notes: string | null;
  createdAt: string; source: "staff" | "qr"; orderItems: Line[]; table: { tableNumber: string }; waiter: { name: string } | null;
};

const lineTotal = (l: Line) => (Number(l.price) + l.orderItemModifiers.reduce((s, m) => s + Number(m.modifier.priceDelta), 0)) * l.quantity;
const STAGE: Record<string, { label: string; cls: string }> = {
  cooking: { label: "Cooking", cls: "bg-status-info-tint text-status-info-ink" },
  ready: { label: "Ready", cls: "bg-status-success-tint text-status-success-ink" },
  served: { label: "Served", cls: "bg-surface-sunken text-ink-secondary" },
};

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const ready = useRequireAuth();
  const { showToast, toastHost } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [popular, setPopular] = useState<number[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [top, setTop] = useState<number | "popular" | "all">("all");
  const [sub, setSub] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [voiding, setVoiding] = useState<Line | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notes, setNotes] = useState("");
  const [undo, setUndo] = useState<{ lineId: number; name: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => apiFetchJson<Order>(`/orders/${id}`).then((o) => { setOrder(o); return o; }), [id]);
  const loadMenu = useCallback(() => apiFetchJson<MenuItem[]>("/menu").then(setMenu).catch(() => {}), []);

  useEffect(() => {
    if (!ready) return;
    refresh().then((o) => setNotes(o.notes ?? "")).catch(() => setLoadError(true));
    loadMenu();
    apiFetchJson<Category[]>("/menu/categories").then(setCats).catch(() => {});
    apiFetchJson<number[]>("/menu/popular").then((p) => { setPopular(p); if (p.length >= 4) setTop("popular"); }).catch(() => {});
  }, [ready, refresh, loadMenu]);

  useCafeSocket(ready, {
    "order.itemReady": (p: { orderId: number }) => p.orderId === Number(id) && refresh(),
    "floor.changed": () => refresh(),
    "menu.changed": () => loadMenu(),
  });

  const topCats = useMemo(() => cats.filter((c) => c.parentId == null && c.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [cats]);
  const subCats = useMemo(() => (typeof top === "number" ? cats.filter((c) => c.parentId === top && c.isActive).sort((a, b) => a.sortOrder - b.sortOrder) : []), [cats, top]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return menu.filter((m) => m.name.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q));
    if (top === "popular") return popular.map((pid) => menu.find((m) => m.id === pid)).filter(Boolean) as MenuItem[];
    if (top === "all") return menu;
    return menu.filter((m) => (sub ? m.categoryId === sub : m.categoryId === top || m.category.parentId === top));
  }, [menu, top, sub, search, popular]);

  const live = order?.orderItems.filter((l) => !l.voidedAt) ?? [];
  const unsent = live.filter((l) => !l.sentToKitchen);
  const sent = order?.orderItems.filter((l) => l.sentToKitchen) ?? [];
  const total = live.reduce((s, l) => s + lineTotal(l), 0);
  const unsentTotal = unsent.reduce((s, l) => s + lineTotal(l), 0);
  const qtyInOrder = (mid: number) => live.filter((l) => l.menuItem.id === mid).reduce((s, l) => s + l.quantity, 0);
  const canEdit = order && ["pending", "preparing", "served"].includes(order.status);
  const cooking = sent.filter((l) => !l.voidedAt && l.status === "pending").length;
  const readyCount = sent.filter((l) => !l.voidedAt && l.status === "ready").length;

  async function add(item: MenuItem, qty = 1, modifierIds: number[] = [], note = "") {
    setBusy(true);
    try {
      const line = await apiFetchJson<{ id: number }>(`/orders/${id}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuItemId: item.id, quantity: qty, modifierIds, note: note || undefined }),
      });
      await refresh();
      setSheetItem(null);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      setUndo({ lineId: line.id, name: `${qty}× ${item.name}` });
      undoTimer.current = setTimeout(() => setUndo(null), 4000);
      navigator.vibrate?.(15);
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  function tapItem(item: MenuItem) {
    if (!canEdit) return showToast(order?.status === "billed" ? "Bill is printed — reopen it from Billing to add more" : "This order is closed", "warning");
    if (!item.isAvailable) return setSheetItem(item); // lets staff un-86 it
    if (item.modifiers.length === 0) add(item); // one tap, with undo
    else setSheetItem(item);
  }

  async function removeLine(l: Line) {
    try {
      await apiFetch(`/orders/items/${l.id}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  async function undoAdd() {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    try {
      await apiFetch(`/orders/items/${u.lineId}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  async function act(path: string, ok: string, after?: () => void) {
    setBusy(true);
    try {
      await apiFetchJson(`/orders/${id}/${path}`, { method: "PATCH" });
      showToast(ok);
      navigator.vibrate?.([20, 40, 20]);
      await refresh();
      after?.();
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function doVoid(reason: string) {
    if (!voiding) return;
    setBusy(true);
    try {
      await apiFetchJson(`/orders/items/${voiding.id}/void`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
      showToast(`${voiding.menuItem.name} removed — kitchen notified`);
      setVoiding(null);
      await refresh();
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSoldOut(item: MenuItem) {
    try {
      await apiFetchJson(`/menu/${item.id}/availability`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isAvailable: !item.isAvailable }) });
      showToast(item.isAvailable ? `${item.name} marked sold out` : `${item.name} is available again`);
      setSheetItem(null);
      loadMenu();
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  async function saveNotes() {
    if ((order?.notes ?? "") === notes) return;
    await apiFetchJson(`/orders/${id}/notes`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) }).catch(() => {});
  }

  if (loadError) return <main className="p-6"><ErrorState title="Couldn't open this order" onRetry={() => location.reload()} /></main>;

  // ── The order panel (right column on tablets, bottom sheet on phones) ──
  const panel = order && (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {unsent.length > 0 && (
          <section>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-status-warning-ink">
              New · not sent yet {order.source === "qr" && <span className="rounded-full bg-status-warning-tint px-2 py-0.5 normal-case">from customer QR</span>}
            </p>
            <ul className="space-y-2">
              {unsent.map((l) => (
                <li key={l.id} className="flex items-start gap-3 rounded-xl border border-status-warning/30 bg-status-warning-tint/50 p-3">
                  <span className="tabular mt-0.5 text-sm font-semibold">{l.quantity}×</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{l.menuItem.name}</p>
                    {l.orderItemModifiers.length > 0 && <p className="text-xs text-ink-secondary">{l.orderItemModifiers.map((m) => m.modifier.name).join(", ")}</p>}
                    {l.note && <p className="text-xs font-medium text-status-warning-ink">“{l.note}”</p>}
                  </div>
                  <span className="tabular text-sm">{rs(lineTotal(l))}</span>
                  <button type="button" aria-label="Remove" onClick={() => removeLine(l)} className="-m-1 p-1 text-ink-faint hover:text-status-danger-ink"><IconTrash className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {sent.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Sent to kitchen</p>
            <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
              {sent.map((l) => {
                const stage = l.status === "pending" ? "cooking" : l.status;
                return (
                  <li key={l.id} className={`flex items-start gap-3 p-3 ${l.voidedAt ? "opacity-50" : ""}`}>
                    <span className="tabular mt-0.5 text-sm font-semibold">{l.quantity}×</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${l.voidedAt ? "line-through" : ""}`}>{l.menuItem.name}</p>
                      {l.orderItemModifiers.length > 0 && <p className="text-xs text-ink-secondary">{l.orderItemModifiers.map((m) => m.modifier.name).join(", ")}</p>}
                      {l.note && <p className="text-xs text-ink-secondary">“{l.note}”</p>}
                      {l.voidedAt && <p className="text-xs text-status-danger-ink">Removed — {l.voidReason}</p>}
                    </div>
                    {!l.voidedAt && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STAGE[stage]?.cls}`}>{STAGE[stage]?.label}</span>}
                    {!l.voidedAt && canEdit && (
                      <button type="button" aria-label="Remove item" onClick={() => setVoiding(l)} className="-m-1 p-1 text-ink-faint hover:text-status-danger-ink"><IconX className="h-4 w-4" /></button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {live.length === 0 && <p className="py-10 text-center text-sm text-ink-faint">Tap items on the menu to start the order.</p>}

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Order note</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} maxLength={300} placeholder="Allergies, birthday, pace…" className="min-h-11 w-full rounded-xl border border-border-strong px-3.5 text-sm outline-none focus:border-brand" />
        </label>
      </div>

      <div className="space-y-2 border-t border-border-subtle p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-sm text-ink-secondary">Total</span>
          <span className="tabular text-xl font-semibold">{rs(total)}</span>
        </div>
        {unsent.length > 0 && canEdit && (
          <Button size="large" className="w-full" loading={busy} icon={<IconFlame />} onClick={() => act("send-to-kitchen", "Sent to kitchen", () => setCartOpen(false))}>
            Send {unsent.reduce((s, l) => s + l.quantity, 0)} to kitchen
          </Button>
        )}
        {order.status === "preparing" && unsent.length === 0 && (
          <Button size="large" className="w-full" variant={cooking ? "secondary" : "primary"} disabled={cooking > 0} loading={busy} icon={<IconCheck />} onClick={() => act("serve", "Marked as served")}>
            {cooking ? `${cooking} still cooking · ${readyCount} ready` : "Mark served"}
          </Button>
        )}
        {order.status === "served" && unsent.length === 0 && (
          <Button size="large" className="w-full" loading={busy} onClick={() => act("bill", "Bill ready", () => router.push(`/billing/${id}`))}>Get bill · {rs(total)}</Button>
        )}
        {order.status === "billed" && <Link href={`/billing/${id}`}><Button size="large" className="w-full">Go to bill</Button></Link>}
        {order.status === "pending" && sent.length === 0 && (
          <button type="button" onClick={() => setConfirmCancel(true)} className="w-full py-2 text-sm font-medium text-ink-faint hover:text-status-danger-ink">Cancel order</button>
        )}
      </div>
    </div>
  );

  return (
    <main className="flex h-[100dvh] flex-col bg-surface-canvas">
      {toastHost}
      {/* Header */}
      <header className="z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-raised px-2 sm:px-4">
        <Link href="/" aria-label="Back to tables" className="rounded-full p-2.5 text-ink-secondary hover:bg-surface-sunken"><IconChevronLeft className="h-5 w-5" /></Link>
        {searching ? (
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu…" className="min-h-10 w-full rounded-full bg-surface-sunken pl-9 pr-3 text-sm outline-none" />
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            {order ? (
              <>
                <p className="truncate text-base font-semibold leading-tight">Table {order.table.tableNumber}</p>
                <p className="truncate text-xs text-ink-faint">{order.waiter?.name ?? "QR order"} · {timeAgo(order.createdAt)}</p>
              </>
            ) : <Skeleton className="h-5 w-24" />}
          </div>
        )}
        <button type="button" aria-label={searching ? "Close search" : "Search"} onClick={() => { setSearching((s) => !s); setSearch(""); }} className="rounded-full p-2.5 text-ink-secondary hover:bg-surface-sunken">
          {searching ? <IconX className="h-5 w-5" /> : <IconSearch className="h-5 w-5" />}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          {/* Category chips */}
          {!search && (
            <div className="shrink-0 border-b border-border-subtle bg-surface-raised">
              <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 py-2.5">
                {popular.length > 0 && <Chip on={top === "popular"} onClick={() => { setTop("popular"); setSub(null); }}>⭐ Popular</Chip>}
                <Chip on={top === "all"} onClick={() => { setTop("all"); setSub(null); }}>All</Chip>
                {topCats.map((c) => <Chip key={c.id} on={top === c.id} onClick={() => { setTop(c.id); setSub(null); }}>{c.name}</Chip>)}
              </div>
              {subCats.length > 0 && (
                <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2.5">
                  <Chip small on={sub == null} onClick={() => setSub(null)}>All</Chip>
                  {subCats.map((c) => <Chip small key={c.id} on={sub === c.id} onClick={() => setSub(c.id)}>{c.name}</Chip>)}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 pb-28 lg:pb-3">
            {menu.length === 0 ? (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">{Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
            ) : shown.length === 0 ? (
              <p className="py-16 text-center text-sm text-ink-faint">No items here.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                {shown.map((m) => {
                  const inOrder = qtyInOrder(m.id);
                  const img = assetUrl(m.imageUrl);
                  const soldOut = !m.isAvailable || (m.trackStock && m.stockQuantity <= 0);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => tapItem(m)}
                      className={`relative flex min-h-[84px] flex-col overflow-hidden rounded-2xl border bg-surface-raised text-left transition active:scale-[0.97] ${inOrder ? "border-brand ring-2 ring-brand/15" : "border-border-subtle"} ${soldOut ? "opacity-45" : ""}`}
                    >
                      {img && <img src={img} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />}
                      <div className="flex flex-1 flex-col p-3">
                        <p className="line-clamp-2 text-sm font-medium leading-snug text-ink-primary">
                          {m.name} {m.tags.includes("veg") && "🟢"}{m.tags.includes("spicy") && "🌶️"}
                        </p>
                        <div className="mt-auto flex items-end justify-between pt-1.5">
                          <span className="tabular text-sm text-ink-secondary">{rs(m.price)}</span>
                          {soldOut ? <span className="text-[11px] font-semibold uppercase text-status-danger-ink">Sold out</span>
                            : m.modifiers.length > 0 ? <span className="text-[11px] text-ink-faint">options</span>
                            : m.trackStock && m.stockQuantity <= 5 ? <span className="text-[11px] text-status-warning-ink">{m.stockQuantity} left</span> : null}
                        </div>
                      </div>
                      {inOrder > 0 && <span className="tabular absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-on-brand shadow-sm">{inOrder}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Order panel: always visible on large screens */}
        <aside className="hidden w-[380px] shrink-0 border-l border-border-subtle bg-surface-raised lg:block">{panel}</aside>
      </div>

      {/* Phone: sticky cart bar in the thumb zone */}
      {order && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
          {undo && (
            <div className="mb-2 flex items-center justify-between rounded-2xl bg-ink-primary px-4 py-2.5 text-sm text-white shadow-lg">
              <span>Added {undo.name}</span>
              <button type="button" onClick={undoAdd} className="flex items-center gap-1 font-semibold text-white"><IconUndo className="h-4 w-4" />Undo</button>
            </div>
          )}
          <button type="button" onClick={() => setCartOpen(true)} className={`flex min-h-14 w-full items-center justify-between rounded-2xl px-5 text-left shadow-lg transition active:scale-[0.99] ${unsent.length ? "bg-brand text-on-brand" : "bg-ink-primary text-white"}`}>
            <span className="text-sm font-semibold">
              {unsent.length ? `${unsent.reduce((s, l) => s + l.quantity, 0)} new · review & send` : readyCount ? `${readyCount} ready to serve` : order.status === "served" ? "Get bill" : `View order (${live.length})`}
            </span>
            <span className="tabular text-base font-semibold">{rs(unsent.length ? unsentTotal : total)}</span>
          </button>
        </div>
      )}
      {undo && <div className="fixed bottom-6 right-[400px] z-30 hidden items-center gap-3 rounded-2xl bg-ink-primary px-4 py-2.5 text-sm text-white shadow-lg lg:flex"><span>Added {undo.name}</span><button type="button" onClick={undoAdd} className="font-semibold">Undo</button></div>}

      <Sheet open={cartOpen} onClose={() => setCartOpen(false)} title={order ? `Table ${order.table.tableNumber}` : ""} tall>{panel}</Sheet>

      <ItemSheet
        item={sheetItem && ({ ...sheetItem, maxQty: sheetItem.trackStock ? Math.max(1, sheetItem.stockQuantity) : 20 } as SheetItem)}
        onClose={() => setSheetItem(null)}
        busy={busy}
        addLabel={sheetItem && !sheetItem.isAvailable ? "Sold out" : "Add to order"}
        onAdd={(p) => sheetItem && sheetItem.isAvailable && add(sheetItem, p.qty, p.modifierIds, p.note)}
        footerExtra={sheetItem && (
          <button type="button" onClick={() => toggleSoldOut(sheetItem)} className="text-sm font-medium text-ink-faint underline-offset-2 hover:underline">
            {sheetItem.isAvailable ? "Mark as sold out" : "Mark as available again"}
          </button>
        )}
      />
      <VoidDialog open={!!voiding} itemName={voiding?.menuItem.name ?? ""} busy={busy} onClose={() => setVoiding(null)} onConfirm={doVoid} />
      <ConfirmDialog open={confirmCancel} title="Cancel this order?" description="The table will be freed." confirmLabel="Cancel order" cancelLabel="Keep" onCancel={() => setConfirmCancel(false)} onConfirm={async () => {
        setConfirmCancel(false);
        try {
          await apiFetchJson(`/orders/${id}/cancel`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
          router.push("/");
        } catch (e) {
          showToast((e as Error).message, "error");
        }
      }} />
    </main>
  );
}

function Chip({ on, onClick, children, small }: { on: boolean; onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`shrink-0 rounded-full font-medium transition ${small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} ${on ? "bg-ink-primary text-white" : small ? "bg-surface-sunken text-ink-secondary" : "border border-border-subtle bg-surface-raised text-ink-secondary"}`}>
      {children}
    </button>
  );
}
