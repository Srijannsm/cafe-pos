"use client";

import { useEffect, useState } from "react";

import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, apiFetchJson, type CurrentUser } from "../../lib/api";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { useCafeSettings, API_BASE } from "../../lib/CafeSettingsContext";
import { IconGrid, IconClipboardList, IconTable, IconUsers, IconLogout, IconClock, IconBarChart, IconMenu, IconX, IconBanknote, IconSettings } from "../../components/icons";
import { NotificationBell } from "../../components/NotificationBell";
import { NavItem } from "../../components/ui/NavItem";
import { Skeleton } from "../../components/ui/Skeleton";

const ALL_NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: IconGrid },
  { href: "/admin/menu", label: "Menu Management", icon: IconClipboardList },
  { href: "/admin/tables", label: "Tables", icon: IconTable },
  { href: "/admin/users", label: "Staff & PINs", icon: IconUsers },
  { href: "/admin/reports", label: "Reports", icon: IconBarChart, requiresReports: true },
  { href: "/admin/billing", label: "Billing & Plan", icon: IconBanknote },
  { href: "/admin/settings", label: "App Settings", icon: IconSettings },
];

const FLOOR_LINKS = [
  { href: "/", label: "Floor View", icon: IconTable },
  { href: "/kitchen", label: "Kitchen", icon: IconClock },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const ready = useRequireAuth();
  const [authorized, setAuthorized] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reportsEnabled, setReportsEnabled] = useState(false);
  const { settings } = useCafeSettings();

  const cafeName = settings?.name ?? "Cafe POS";
  const logoUrl = settings?.logoUrl ? `${API_BASE}${settings.logoUrl}` : null;

  useEffect(() => {
    if (!ready) return;
    const current = getCurrentUser();
    if (current?.role !== "admin") {
      router.replace("/");
      return;
    }
    setUser(current);
    setAuthorized(true);
    apiFetchJson<{ features: { reports: boolean } }>("/cafes/my-plan")
      .then((data) => setReportsEnabled(data.features.reports))
      .catch(() => setReportsEnabled(false));
  }, [ready, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  if (!ready || !authorized || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-canvas">
        <Skeleton className="h-8 w-40 rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-surface-canvas">
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`print:hidden fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-border-subtle bg-surface-raised transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-5">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt={cafeName} className="h-8 w-8 rounded-md object-cover" />
            ) : (
              <span className="h-2.5 w-2.5 rounded-full bg-brand" />
            )}
            <div>
              <div className="font-display text-sm font-bold text-ink-primary">{cafeName}</div>
              <div className="label-sm text-ink-faint">Admin</div>
            </div>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary transition hover:bg-surface-sunken hover:text-ink-primary md:hidden"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            <IconX />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {ALL_NAV_ITEMS.filter((item) => !item.requiresReports || reportsEnabled).map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={pathname === item.href}
            />
          ))}
        </nav>

        <div className="border-t border-border-subtle p-3">
          <p className="label-sm px-3 pb-1 text-ink-faint">Floor views</p>
          <div className="space-y-1">
            {FLOOR_LINKS.map((item) => (
              <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} active={false} />
            ))}
          </div>
        </div>

        <div className="body-sm border-t border-border-subtle px-5 py-4 text-ink-faint">
          Powered by {cafeName}
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="print:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border-subtle bg-surface-raised/95 px-4 py-3 backdrop-blur sm:px-6">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-secondary transition hover:bg-surface-sunken hover:text-ink-primary md:hidden"
            aria-label="Open sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            <IconMenu />
          </button>

          <div className="flex flex-1 items-center justify-end gap-3">
            <NotificationBell authReady={ready} />

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition hover:bg-surface-sunken"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-sunken text-xs font-bold text-ink-secondary">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="hidden text-sm font-semibold text-ink-primary sm:inline">{user.name}</span>
              </button>

              {menuOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-10 cursor-default"
                    aria-label="Close menu"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-20 mt-2 w-40 overflow-hidden rounded-lg border border-border-subtle bg-surface-overlay shadow-lg">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="body-md flex w-full items-center gap-2 px-4 py-2.5 text-left font-medium text-ink-primary transition hover:bg-surface-sunken"
                    >
                      <IconLogout className="h-4 w-4" />
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
