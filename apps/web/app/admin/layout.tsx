"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, type CurrentUser } from "../../lib/api";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { IconGrid, IconClipboardList, IconTable, IconBell, IconLogout, IconClock } from "../../components/icons";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: IconGrid },
  { href: "/admin/menu", label: "Menu Management", icon: IconClipboardList },
  { href: "/admin/tables", label: "Tables", icon: IconTable },
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

  useEffect(() => {
    if (!ready) return;
    const current = getCurrentUser();
    if (current?.role !== "admin") {
      router.replace("/");
      return;
    }
    setUser(current);
    setAuthorized(true);
  }, [ready, router]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  if (!ready || !authorized || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-stone-200" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-stone-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-stone-200 bg-white">
        <div className="flex items-center gap-2 border-b border-stone-200 px-5 py-5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          <div>
            <div className="text-sm font-bold text-stone-900">Cafe POS</div>
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">Admin</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? "bg-primary-subtle text-primary-subtle-fg"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                <Icon />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-stone-200 p-3">
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">Floor views</p>
          <div className="space-y-1">
            {FLOOR_LINKS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
                >
                  <Icon />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="border-t border-stone-200 px-5 py-4 text-xs text-stone-400">Powered by Cafe POS</div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-end gap-3 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
            aria-label="Notifications"
          >
            <IconBell />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition hover:bg-stone-100"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-200 text-xs font-bold text-stone-700">
                {user.name.charAt(0).toUpperCase()}
              </span>
              <span className="hidden text-sm font-semibold text-stone-800 sm:inline">{user.name}</span>
            </button>

            {menuOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-2 w-40 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                  >
                    <IconLogout className="h-4 w-4" />
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
