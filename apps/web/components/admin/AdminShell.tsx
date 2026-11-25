"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout, type CurrentUser } from "../../lib/api";
import { useCafeSettings } from "../../lib/CafeSettingsContext";
import { assetUrl } from "../../lib/format";
import { NotificationBell } from "../NotificationBell";
import {
  IconGrid, IconClipboardList, IconBox, IconWallet, IconBarChart, IconTable, IconUsers, IconSettings,
  IconBanknote, IconChevronDown, IconMenu, IconLogout, IconClock, IconReceipt, IconExternal, IconX,
} from "../icons";

type IconType = React.ComponentType<{ className?: string }>;
type NavLeaf = { label: string; href: string };
type NavGroup = { label: string; icon: IconType; href?: string; children?: NavLeaf[]; show?: boolean };

const SIDEBAR_KEY = "adminSidebarCollapsed";

// Same layout model as Aaramva Shikshya: fixed left sidebar (290px, collapses
// to an 90px icon rail on desktop, slides in on mobile), sticky header,
// content in a max-width container. Groups expand to show their pages.
export function AdminShell({
  user, reportsEnabled, inventoryInPlan, lowStock, children,
}: { user: CurrentUser; reportsEnabled: boolean; inventoryInPlan: boolean; lowStock: number; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { settings, refresh } = useCafeSettings();
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!settings) refresh();
    setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setMobileOpen(false), [pathname]);

  const nav: NavGroup[] = useMemo(
    () => [
      { label: "Dashboard", icon: IconGrid, href: "/admin" },
      {
        label: "Menu", icon: IconClipboardList,
        children: [
          { label: "Items", href: "/admin/menu" },
          { label: "Categories", href: "/admin/menu/categories" },
        ],
      },
      {
        label: "Inventory", icon: IconBox, show: inventoryInPlan && settings?.inventoryEnabled !== false,
        children: [
          { label: "Stock", href: "/admin/inventory" },
          { label: "Purchases", href: "/admin/inventory/purchases" },
          { label: "Suppliers", href: "/admin/inventory/suppliers" },
          { label: "Stock history", href: "/admin/inventory/history" },
        ],
      },
      {
        label: "Cash & expenses", icon: IconWallet,
        children: [
          { label: "Today's drawer", href: "/admin/cash" },
          { label: "Expenses", href: "/admin/cash/expenses" },
          { label: "Shift history", href: "/admin/cash/shifts" },
        ],
      },
      { label: "Reports", icon: IconBarChart, href: "/admin/reports", show: reportsEnabled },
      { label: "Tables & QR", icon: IconTable, href: "/admin/tables" },
      { label: "Staff", icon: IconUsers, href: "/admin/users" },
      { label: "Settings", icon: IconSettings, href: "/admin/settings" },
      { label: "Plan", icon: IconBanknote, href: "/admin/billing" },
    ],
    [settings?.inventoryEnabled, reportsEnabled, inventoryInPlan],
  );

  const visible = nav.filter((g) => g.show !== false);
  const isActive = (href: string) => pathname === href;
  const groupActive = (g: NavGroup) =>
    g.href ? isActive(g.href) : !!g.children?.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"));
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const g = visible.find((x) => x.children && groupActive(x));
    setOpen(g?.label ?? null);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const showLabels = !collapsed || hovered || mobileOpen;
  const cafeName = settings?.name ?? "Cafe POS";
  const logo = assetUrl(settings?.logoUrl);

  function toggleCollapse() {
    if (window.innerWidth < 1024) {
      setMobileOpen((o) => !o);
      return;
    }
    setCollapsed((c) => {
      localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
      return !c;
    });
  }

  return (
    <div className="min-h-screen bg-surface-canvas">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-overlay-backdrop backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        onMouseEnter={() => collapsed && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`print:hidden fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-border-subtle bg-surface-raised px-4 transition-all duration-300 ease-in-out
          ${showLabels ? "w-[280px]" : "w-[88px]"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >
        <div className={`flex items-center gap-3 py-6 ${showLabels ? "px-2" : "justify-center"}`}>
          {logo ? (
            <img src={logo} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-sm font-bold text-on-brand">
              {cafeName.charAt(0)}
            </span>
          )}
          {showLabels && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-primary">{cafeName}</p>
              <p className="text-[11px] uppercase tracking-widest text-ink-faint">Admin</p>
            </div>
          )}
          {mobileOpen && (
            <button type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-sunken lg:hidden">
              <IconX className="h-5 w-5" />
            </button>
          )}
        </div>

        <nav className="no-scrollbar flex-1 overflow-y-auto pb-6">
          <p className={`mb-3 text-xs uppercase text-ink-faint ${showLabels ? "px-3" : "text-center"}`}>
            {showLabels ? "Menu" : "•••"}
          </p>
          <ul className="flex flex-col gap-1">
            {visible.map((g) => {
              const active = groupActive(g);
              const Icon = g.icon;
              const rowClass = `group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active ? "bg-brand-tint text-brand-strong" : "text-ink-secondary hover:bg-surface-sunken hover:text-ink-primary"
              } ${showLabels ? "" : "justify-center"}`;
              return (
                <li key={g.label}>
                  {g.children ? (
                    <button type="button" className={rowClass} onClick={() => setOpen((o) => (o === g.label ? null : g.label))} aria-expanded={open === g.label}>
                      <Icon className="h-5 w-5 shrink-0" />
                      {showLabels && <span className="flex-1 text-left">{g.label}</span>}
                      {showLabels && g.label === "Inventory" && lowStock > 0 && (
                        <span className="rounded-full bg-status-warning-tint px-2 py-0.5 text-[11px] font-semibold text-status-warning-ink">{lowStock} low</span>
                      )}
                      {showLabels && <IconChevronDown className={`h-4 w-4 transition-transform ${open === g.label ? "rotate-180" : ""}`} />}
                    </button>
                  ) : (
                    <Link href={g.href!} className={rowClass}>
                      <Icon className="h-5 w-5 shrink-0" />
                      {showLabels && <span>{g.label}</span>}
                    </Link>
                  )}
                  {g.children && showLabels && open === g.label && (
                    <ul className="ml-11 mt-1 space-y-0.5">
                      {g.children.map((c) => (
                        <li key={c.href}>
                          <Link
                            href={c.href}
                            className={`block rounded-lg px-3 py-2 text-sm transition ${
                              isActive(c.href) ? "font-medium text-brand-strong" : "text-ink-secondary hover:text-ink-primary"
                            }`}
                          >
                            {c.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <p className={`mb-3 mt-8 text-xs uppercase text-ink-faint ${showLabels ? "px-3" : "text-center"}`}>
            {showLabels ? "Floor" : "•••"}
          </p>
          <ul className="flex flex-col gap-1">
            {[
              { label: "Tables", href: "/", icon: IconTable },
              { label: "Kitchen display", href: "/kitchen", icon: IconClock },
              { label: "Billing counter", href: "/billing", icon: IconReceipt },
            ].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-sunken hover:text-ink-primary ${showLabels ? "" : "justify-center"}`}
                >
                  <l.icon className="h-5 w-5 shrink-0" />
                  {showLabels && <span className="flex-1">{l.label}</span>}
                  {showLabels && <IconExternal className="h-3.5 w-3.5 text-ink-faint" />}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className={`flex min-h-screen flex-col transition-all duration-300 ${collapsed ? "lg:ml-[88px]" : "lg:ml-[280px]"}`}>
        <header className="print:hidden sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border-subtle bg-surface-raised/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={toggleCollapse}
            aria-label="Toggle sidebar"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle text-ink-secondary transition hover:bg-surface-sunken"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <NotificationBell authReady />
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition hover:bg-surface-sunken"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tint text-sm font-semibold text-brand-strong">
                {user.name.charAt(0).toUpperCase()}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-medium leading-tight text-ink-primary">{user.name}</span>
                <span className="block text-xs capitalize leading-tight text-ink-faint">{user.role}</span>
              </span>
              <IconChevronDown className="hidden h-4 w-4 text-ink-faint sm:block" />
            </button>
            {menuOpen && (
              <>
                <button type="button" aria-label="Close" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-2xl border border-border-subtle bg-surface-overlay p-1.5 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      router.push("/login");
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-secondary transition hover:bg-surface-sunken hover:text-ink-primary"
                  >
                    <IconLogout className="h-4 w-4" /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-screen-2xl flex-1 p-4 md:p-6 2xl:p-8">{children}</main>
      </div>
    </div>
  );
}
