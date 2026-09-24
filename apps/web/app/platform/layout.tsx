// apps/web/app/platform/layout.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getPlatformToken,
  getCurrentPlatformUser,
  platformLogout,
} from "../../lib/api";
import {
  IconGrid,
  IconBanknote,
  IconBell,
  IconLogout,
  IconMenu,
  IconX,
} from "../../components/icons";
import { NavItem } from "../../components/ui/NavItem";
import { Skeleton } from "../../components/ui/Skeleton";

const NAV_ITEMS = [
  { href: "/platform", label: "Overview", icon: IconGrid },
  { href: "/platform/cafes", label: "Cafes", icon: IconBanknote },
];

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Login page lives inside this layout directory, so we must render it
  // without the shell — otherwise the auth check redirects back to login,
  // creating an infinite loop that leaves a blank page.
  const isLoginPage = pathname === "/platform/login";

  useEffect(() => {
    if (isLoginPage) return; // let the login page render itself, no redirect
    if (!getPlatformToken()) {
      router.replace("/platform/login");
      return;
    }
    const current = getCurrentPlatformUser();
    if (!current) {
      router.replace("/platform/login");
      return;
    }
    setUser(current);
    setAuthorized(true);
  }, [router, isLoginPage]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  function handleLogout() {
    platformLogout();
    router.push("/platform/login");
  }

  // Render the login page without the authenticated shell
  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!authorized || !user) {
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
            <span className="h-2.5 w-2.5 rounded-full bg-brand" />
            <div>
              <div className="font-display text-sm font-bold text-ink-primary">
                Cafe POS
              </div>
              <div className="label-sm text-ink-faint">Platform</div>
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
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={pathname === item.href}
            />
          ))}
        </nav>
        <div className="body-sm border-t border-border-subtle px-5 py-4 text-ink-faint">
          Platform admin
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
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full text-ink-secondary transition hover:bg-surface-sunken hover:text-ink-primary"
              aria-label="Notifications"
            >
              <IconBell />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition hover:bg-surface-sunken"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-sunken text-xs font-bold text-ink-secondary">
                  {user.username.charAt(0).toUpperCase()}
                </span>
                <span className="hidden text-sm font-semibold text-ink-primary sm:inline">
                  {user.username}
                </span>
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
