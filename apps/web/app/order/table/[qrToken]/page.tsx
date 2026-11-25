"use client";

import { useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import { publicFetchJson } from "../../../../lib/api";
import { applyBrand } from "../../../../lib/theme";
import { assetUrl, rs } from "../../../../lib/format";
import { TAGS } from "../../../../lib/menu-types";
import { ItemSheet } from "../../../../components/order/ItemSheet";
import { TableGame } from "../../../../components/order/TableGame";
import { Sheet, Stepper } from "../../../../components/ui/Sheet";
import { Skeleton } from "../../../../components/ui/Skeleton";
import { IconHand, IconReceipt, IconWifi, IconSearch, IconX, IconGamepad, IconCheckCircle, IconPhone } from "../../../../components/icons";
import { DICT, type Lang } from "./i18n";

type Mod = { id: number; name: string; priceDelta: string };
type Item = { id: number; name: string; price: string; description: string | null; imageUrl: string | null; tags: string[]; categoryId: number; isAvailable: boolean; modifiers: Mod[] };
type Cat = { id: number; name: string; parentId: number | null };
type ActiveOrder = { id: number; status: string; total: string | null; items: { id: number; name: string; quantity: number; price: string; modifiers: string[]; note: string | null; stage: string }[] };
type Data = {
  cafe: {
    name: string; logoUrl: string | null; coverImageUrl: string | null; themeColor: string | null; tagline: string | null; fontStyle: string; menuLayout: string;
    phone: string | null; address: string | null; wifiName: string | null; wifiPassword: string | null; instagram: string | null; facebook: string | null; tiktok: string | null;
    vatEnabled: boolean; pricesIncludeVat: boolean; panNumber: string | null; gamesEnabled: boolean;
  };
  table: { tableNumber: string };
  categories: Cat[];
  menu: Item[];
  popularIds: number[];
  activeOrder: ActiveOrder | null;
};
type CartLine = { key: string; itemId: number; qty: number; modifierIds: number[]; note: string };

const STAGE_STYLE: Record<string, string> = {
  waiting: "bg-status-warning-tint text-status-warning-ink",
  cooking: "bg-status-info-tint text-status-info-ink",
  ready: "bg-status-success-tint text-status-success-ink",
  served: "bg-surface-sunken text-ink-secondary",
};

export default function QrMenu({ params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [lang, setLang] = useState<Lang>("en");
  const t = useCallback((k: string) => (DICT[lang] as Record<string, string>)[k] ?? k, [lang]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [sheetItem, setSheetItem] = useState<Item | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [activeCat, setActiveCat] = useState<number | "popular" | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const cartKey = `qr-cart-${qrToken}`;

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2800);
  };

  const load = useCallback(async () => {
    try {
      const d = await publicFetchJson<Data>(`/public/tables/${qrToken}`);
      setData(d);
      applyBrand(d.cafe.themeColor, d.cafe.fontStyle);
      document.title = `${d.cafe.name} — Table ${d.table.tableNumber}`;
    } catch (e) {
      setError((e as Error).message);
    }
  }, [qrToken]);

  useEffect(() => {
    load();
    try {
      const saved = sessionStorage.getItem(cartKey);
      if (saved) setCart(JSON.parse(saved));
      const l = localStorage.getItem("qr-lang");
      if (l === "ne" || l === "en") setLang(l);
    } catch { /* private mode */ }
  }, [load, cartKey]);

  useEffect(() => {
    try { sessionStorage.setItem(cartKey, JSON.stringify(cart)); } catch { /* ignore */ }
  }, [cart, cartKey]);

  // Live status of the table's order -- light polling is enough for customers.
  useEffect(() => {
    if (!data?.activeOrder) return;
    const id = setInterval(async () => {
      try {
        const s = await publicFetchJson<{ activeOrder: ActiveOrder | null }>(`/public/tables/${qrToken}/status`);
        setData((d) => (d ? { ...d, activeOrder: s.activeOrder } : d));
      } catch { /* ignore */ }
    }, 10000);
    return () => clearInterval(id);
  }, [data?.activeOrder?.id, qrToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = data?.menu ?? [];
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const tops = useMemo(() => (data?.categories ?? []).filter((c) => c.parentId == null), [data]);
  const sections = useMemo(() => {
    if (!data) return [];
    const out: { key: string; title: string; sub?: string; items: Item[] }[] = [];
    const pop = data.popularIds.map((id) => byId.get(id)).filter((x): x is Item => !!x && x.isAvailable);
    if (pop.length >= 3) out.push({ key: "popular", title: t("popular"), items: pop });
    for (const top of tops) {
      const direct = items.filter((i) => i.categoryId === top.id);
      if (direct.length) out.push({ key: `c${top.id}`, title: top.name, items: direct });
      for (const sub of data.categories.filter((c) => c.parentId === top.id)) {
        const list = items.filter((i) => i.categoryId === sub.id);
        if (list.length) out.push({ key: `c${sub.id}`, title: top.name, sub: sub.name, items: list });
      }
    }
    return out;
  }, [data, items, tops, byId, t]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)) : [];
  }, [search, items]);

  const unitPrice = (l: CartLine) => {
    const it = byId.get(l.itemId);
    if (!it) return 0;
    return Number(it.price) + it.modifiers.filter((m) => l.modifierIds.includes(m.id)).reduce((s, m) => s + Number(m.priceDelta), 0);
  };
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const cartTotal = cart.reduce((s, l) => s + unitPrice(l) * l.qty, 0);

  function addToCart(item: Item, qty: number, modifierIds: number[], note: string) {
    const key = `${item.id}:${[...modifierIds].sort().join(",")}:${note}`;
    setCart((c) => {
      const ex = c.find((l) => l.key === key);
      return ex ? c.map((l) => (l.key === key ? { ...l, qty: Math.min(20, l.qty + qty) } : l)) : [...c, { key, itemId: item.id, qty, modifierIds, note }];
    });
    setSheetItem(null);
    navigator.vibrate?.(12);
    flash(`+${qty} ${item.name}`);
  }

  async function placeOrder() {
    if (!cart.length) return;
    setPlacing(true);
    try {
      const order = await publicFetchJson<ActiveOrder>(`/public/tables/${qrToken}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.map((l) => ({ menuItemId: l.itemId, quantity: l.qty, modifierIds: l.modifierIds, note: l.note || undefined })) }),
      });
      setCart([]);
      setCartOpen(false);
      setData((d) => (d ? { ...d, activeOrder: order } : d));
      setOrderOpen(true);
      flash(t("orderSent"));
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setPlacing(false);
    }
  }

  async function request(type: "call_waiter" | "request_bill") {
    try {
      await publicFetchJson(`/public/tables/${qrToken}/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) });
      flash(t("requested"));
    } catch (e) {
      flash((e as Error).message);
    }
  }

  function jump(key: string, cat: number | "popular") {
    setActiveCat(cat);
    const el = sectionRefs.current[key];
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 64, behavior: "smooth" });
  }

  if (error) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-4xl">🍵</p>
        <p className="text-lg font-semibold">{error}</p>
        <p className="text-sm text-ink-secondary">Please ask a staff member for help.</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-xl">
        <Skeleton className="h-48 w-full rounded-none" />
        <div className="grid grid-cols-2 gap-3 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
      </main>
    );
  }

  const c = data.cafe;
  const cover = assetUrl(c.coverImageUrl);
  const logo = assetUrl(c.logoUrl);
  const grid = c.menuLayout !== "list";
  const ao = data.activeOrder;
  const upsell = data.popularIds.map((id) => byId.get(id)).filter((x): x is Item => !!x && x.isAvailable && x.modifiers.length === 0 && !cart.some((l) => l.itemId === x.id)).slice(0, 3);

  const card = (i: Item) => {
    const img = assetUrl(i.imageUrl);
    const inCart = cart.filter((l) => l.itemId === i.id).reduce((s, l) => s + l.qty, 0);
    const tags = i.tags.map((tg) => TAGS.find((x) => x.value === tg)?.emoji).join(" ");
    return grid ? (
      <button key={i.id} type="button" disabled={!i.isAvailable} onClick={() => setSheetItem(i)} className={`relative flex flex-col overflow-hidden rounded-2xl border bg-surface-raised text-left transition active:scale-[0.98] ${inCart ? "border-brand" : "border-border-subtle"} ${i.isAvailable ? "" : "opacity-50"}`}>
        {img ? (
          <div className="aspect-[4/3] w-full bg-surface-sunken"><img src={img} alt="" loading="lazy" className="h-full w-full object-cover" /></div>
        ) : (
          // No photo yet: a soft brand-tinted tile with the initial, so the grid still feels designed.
          <div className="flex aspect-[5/2] w-full items-center justify-center bg-brand-tint font-display text-2xl font-semibold text-brand-strong/70">{i.name.charAt(0)}</div>
        )}
        <div className="flex flex-1 flex-col p-3">
          <p className="line-clamp-2 text-sm font-medium leading-snug">{i.name} <span className="text-xs">{tags}</span></p>
          {i.description && <p className="mt-0.5 line-clamp-1 text-xs text-ink-faint">{i.description}</p>}
          <div className="mt-auto flex items-center justify-between pt-2">
            <span className="tabular text-sm font-semibold">{rs(i.price)}</span>
            {i.isAvailable ? <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-lg font-medium text-on-brand">+</span> : <span className="text-[11px] font-semibold uppercase text-status-danger-ink">{t("soldOut")}</span>}
          </div>
        </div>
        {inCart > 0 && <span className="tabular absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-on-brand shadow">{inCart}</span>}
      </button>
    ) : (
      <button key={i.id} type="button" disabled={!i.isAvailable} onClick={() => setSheetItem(i)} className={`flex w-full gap-3 border-b border-border-subtle py-4 text-left last:border-0 ${i.isAvailable ? "" : "opacity-50"}`}>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{i.name} <span className="text-xs">{tags}</span></p>
          {i.description && <p className="mt-0.5 line-clamp-2 text-sm text-ink-secondary">{i.description}</p>}
          <p className="tabular mt-1.5 text-sm font-semibold">{rs(i.price)} {inCart > 0 && <span className="ml-1 rounded-full bg-brand px-2 py-0.5 text-xs text-on-brand">{inCart} in cart</span>}{!i.isAvailable && <span className="ml-2 text-xs uppercase text-status-danger-ink">{t("soldOut")}</span>}</p>
        </div>
        {img && <img src={img} alt="" loading="lazy" className="h-24 w-24 shrink-0 rounded-xl object-cover" />}
      </button>
    );
  };

  return (
    <main className="mx-auto min-h-[100dvh] max-w-xl bg-surface-canvas pb-40">
      {/* Hero */}
      <header className="relative">
        <div className="relative h-44 w-full overflow-hidden bg-brand sm:h-56">
          {cover && <img src={cover} alt="" className="h-full w-full object-cover" fetchPriority="high" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <button type="button" onClick={() => { const l = lang === "en" ? "ne" : "en"; setLang(l); try { localStorage.setItem("qr-lang", l); } catch { /* */ } }} className="absolute right-3 top-3 rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
            {lang === "en" ? "नेपाली" : "English"}
          </button>
          <div className="absolute bottom-4 left-4 right-4 flex items-end gap-3 text-white">
            {logo ? <img src={logo} alt="" className="h-14 w-14 rounded-2xl border-2 border-white object-cover shadow" /> : <span className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-white bg-brand text-2xl font-semibold text-on-brand">{c.name.charAt(0)}</span>}
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-semibold leading-tight">{c.name}</h1>
              {c.tagline && <p className="truncate text-sm text-white/85">{c.tagline}</p>}
            </div>
            <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-semibold text-ink-primary">{t("table")} {data.table.tableNumber}</span>
          </div>
        </div>
        {(c.wifiName || c.instagram || c.phone) && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3 text-xs">
            {c.wifiName && (
              <button type="button" onClick={() => { navigator.clipboard?.writeText(c.wifiPassword ?? "").then(() => flash(t("copied"))).catch(() => {}); }} className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-raised px-3 py-1.5">
                <IconWifi className="h-3.5 w-3.5" /> {c.wifiName}{c.wifiPassword && <span className="text-ink-faint">· {c.wifiPassword}</span>}
              </button>
            )}
            {c.instagram && <a href={`https://instagram.com/${c.instagram}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-full border border-border-subtle bg-surface-raised px-3 py-1.5">📸 @{c.instagram}</a>}
            {c.tiktok && <a href={`https://tiktok.com/@${c.tiktok}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-full border border-border-subtle bg-surface-raised px-3 py-1.5">🎵 @{c.tiktok}</a>}
            {c.phone && <a href={`tel:${c.phone}`} className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-raised px-3 py-1.5"><IconPhone className="h-3.5 w-3.5" />{c.phone}</a>}
          </div>
        )}
      </header>

      {/* Active order + play */}
      {ao && ao.items.length > 0 && (
        <div className="space-y-2 px-4 pt-4">
          <button type="button" onClick={() => setOrderOpen(true)} className="flex w-full items-center gap-3 rounded-2xl border border-border-subtle bg-surface-raised p-4 text-left">
            <IconCheckCircle className="h-6 w-6 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t("yourOrder")} · {ao.items.reduce((s, i) => s + i.quantity, 0)} {t("items")}</p>
              <p className="truncate text-xs text-ink-secondary">
                {ao.status === "billed" ? t("billPrinted") : ao.items.some((i) => i.stage === "waiting") ? t("waiting") : ao.items.some((i) => i.stage === "cooking") ? t("cooking") : t("served")}
              </p>
            </div>
            <span className="text-sm font-medium text-brand-strong">›</span>
          </button>
          {c.gamesEnabled && (
            <button type="button" onClick={() => setGameOpen(true)} className="flex w-full items-center gap-3 rounded-2xl bg-brand p-4 text-left text-on-brand">
              <IconGamepad className="h-6 w-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t("play")}</p>
                <p className="truncate text-xs opacity-85">{t("playHint")}</p>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Category nav */}
      <nav className="sticky top-0 z-20 mt-3 border-b border-border-subtle bg-surface-canvas/95 backdrop-blur">
        {searching ? (
          <div className="flex items-center gap-2 px-4 py-2.5">
            <div className="relative flex-1">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} className="min-h-10 w-full rounded-full bg-surface-raised pl-9 pr-3 text-sm outline-none ring-1 ring-border-subtle" />
            </div>
            <button type="button" aria-label="Close search" onClick={() => { setSearching(false); setSearch(""); }} className="p-2"><IconX className="h-5 w-5" /></button>
          </div>
        ) : (
          <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-4 py-2.5">
            <button type="button" aria-label="Search" onClick={() => setSearching(true)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised ring-1 ring-border-subtle"><IconSearch className="h-4 w-4" /></button>
            {sections.some((s) => s.key === "popular") && (
              <button type="button" onClick={() => jump("popular", "popular")} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${activeCat === "popular" ? "bg-brand text-on-brand" : "bg-surface-raised ring-1 ring-border-subtle"}`}>⭐ {t("popular")}</button>
            )}
            {tops.map((tp) => {
              const first = sections.find((s) => s.key === `c${tp.id}` || data.categories.some((x) => x.parentId === tp.id && s.key === `c${x.id}`));
              if (!first) return null;
              return (
                <button key={tp.id} type="button" onClick={() => jump(first.key, tp.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${activeCat === tp.id ? "bg-brand text-on-brand" : "bg-surface-raised ring-1 ring-border-subtle"}`}>
                  {tp.name}
                </button>
              );
            })}
          </div>
        )}
      </nav>

      {/* Menu */}
      <div className="px-4">
        {search ? (
          results.length ? <div className={grid ? "grid grid-cols-2 gap-3 pt-4" : "pt-2"}>{results.map(card)}</div> : <p className="py-16 text-center text-sm text-ink-faint">{t("noResults")}</p>
        ) : (
          sections.map((s) => (
            <section key={s.key} ref={(el) => { sectionRefs.current[s.key] = el; }} className="pt-6">
              <h2 className="mb-3 font-display text-lg font-semibold">
                {s.sub ? <><span className="text-ink-faint">{s.title} · </span>{s.sub}</> : s.title}
              </h2>
              <div className={grid ? "grid grid-cols-2 gap-3" : ""}>{s.items.map(card)}</div>
            </section>
          ))
        )}
        <footer className="mt-10 space-y-1 text-center text-xs text-ink-faint">
          {c.vatEnabled && <p>{c.pricesIncludeVat ? t("vatIncl") : t("vatExcl")}{c.panNumber ? ` · ${t("pan")} ${c.panNumber}` : ""}</p>}
          {c.address && <p>{c.address}</p>}
        </footer>
      </div>

      {/* Bottom actions */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl space-y-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {toast && <div className="mx-auto w-fit rounded-full bg-ink-primary px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
        {cartCount > 0 ? (
          <button type="button" onClick={() => setCartOpen(true)} className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-brand px-5 text-on-brand shadow-lg active:scale-[0.99]">
            <span className="flex items-center gap-2 text-sm font-semibold"><span className="tabular rounded-full bg-white/20 px-2 py-0.5">{cartCount}</span>{t("viewCart")}</span>
            <span className="tabular font-semibold">{rs(cartTotal)}</span>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => request("call_waiter")} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-surface-raised text-sm font-semibold shadow-md ring-1 ring-border-subtle active:scale-[0.98]"><IconHand className="h-4 w-4" />{t("callWaiter")}</button>
            <button type="button" onClick={() => request("request_bill")} disabled={!ao} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-surface-raised text-sm font-semibold shadow-md ring-1 ring-border-subtle active:scale-[0.98] disabled:opacity-40"><IconReceipt className="h-4 w-4" />{t("requestBill")}</button>
          </div>
        )}
      </div>

      <ItemSheet
        item={sheetItem}
        onClose={() => setSheetItem(null)}
        addLabel={t("addToOrder")}
        onAdd={(p) => sheetItem && addToCart(sheetItem, p.qty, p.modifierIds, p.note)}
      />

      {/* Cart */}
      <Sheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title={`${t("yourOrder")} · ${t("table")} ${data.table.tableNumber}`}
        footer={
          <div>
            <p className="mb-3 text-center text-xs text-ink-secondary">{t("confirmNote")}</p>
            <button type="button" disabled={placing || !cart.length} onClick={placeOrder} className="flex min-h-13 w-full items-center justify-between rounded-full bg-brand px-6 py-3.5 text-base font-semibold text-on-brand disabled:opacity-60">
              <span>{placing ? t("placing") : t("placeOrder")}</span><span className="tabular">{rs(cartTotal)}</span>
            </button>
          </div>
        }
      >
        <ul className="divide-y divide-border-subtle px-5">
          {cart.map((l) => {
            const it = byId.get(l.itemId);
            if (!it) return null;
            return (
              <li key={l.key} className="flex items-start gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{it.name}</p>
                  {l.modifierIds.length > 0 && <p className="text-xs text-ink-secondary">{it.modifiers.filter((m) => l.modifierIds.includes(m.id)).map((m) => m.name).join(", ")}</p>}
                  {l.note && <p className="text-xs text-ink-secondary">“{l.note}”</p>}
                  <p className="tabular mt-1 text-sm font-semibold">{rs(unitPrice(l) * l.qty)}</p>
                </div>
                <Stepper size="sm" min={0} value={l.qty} onChange={(v) => setCart((cs) => (v === 0 ? cs.filter((x) => x.key !== l.key) : cs.map((x) => (x.key === l.key ? { ...x, qty: v } : x))))} />
              </li>
            );
          })}
        </ul>
        {upsell.length > 0 && (
          <div className="px-5 pb-4">
            <p className="mb-2 text-sm font-semibold">{t("goesWell")}</p>
            <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5">
              {upsell.map((u) => (
                <button key={u.id} type="button" onClick={() => addToCart(u, 1, [], "")} className="w-36 shrink-0 overflow-hidden rounded-2xl border border-border-subtle text-left">
                  <div className="aspect-[4/3] bg-surface-sunken">{assetUrl(u.imageUrl) && <img src={assetUrl(u.imageUrl)!} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="p-2.5"><p className="truncate text-xs font-medium">{u.name}</p><p className="tabular text-xs text-ink-secondary">+ {rs(u.price)}</p></div>
                </button>
              ))}
            </div>
          </div>
        )}
      </Sheet>

      {/* Order status */}
      <Sheet open={orderOpen && !!ao} onClose={() => setOrderOpen(false)} title={t("yourOrder")} footer={
        <div className="flex gap-2">
          <button type="button" onClick={() => setOrderOpen(false)} className="min-h-12 flex-1 rounded-full border border-border-strong font-semibold">{t("addMore")}</button>
          {c.gamesEnabled && <button type="button" onClick={() => { setOrderOpen(false); setGameOpen(true); }} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-brand font-semibold text-on-brand"><IconGamepad className="h-5 w-5" />{t("play")}</button>}
        </div>
      }>
        {ao && (
          <div className="px-5 pb-4">
            {ao.status === "billed" && <p className="mb-3 rounded-xl bg-brand-tint px-4 py-3 text-sm font-medium text-brand-strong">{t("billPrinted")}</p>}
            <ul className="divide-y divide-border-subtle">
              {ao.items.map((i) => (
                <li key={i.id} className="flex items-start gap-3 py-3">
                  <span className="tabular text-sm font-semibold">{i.quantity}×</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{i.name}</p>
                    {i.modifiers.length > 0 && <p className="text-xs text-ink-secondary">{i.modifiers.join(", ")}</p>}
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STAGE_STYLE[i.stage] ?? ""}`}>{t(i.stage)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-border-subtle pt-3 text-sm">
              <span className="text-ink-secondary">{t("total")}</span>
              <span className="tabular font-semibold">{rs(ao.total ?? ao.items.reduce((s, i) => s + Number(i.price) * i.quantity, 0))}</span>
            </div>
          </div>
        )}
      </Sheet>

      {c.gamesEnabled && (
        <Sheet open={gameOpen} onClose={() => setGameOpen(false)} title={`🎮 ${t("play")}`}>
          {gameOpen && <TableGame qrToken={qrToken} t={t} />}
        </Sheet>
      )}
    </main>
  );
}
