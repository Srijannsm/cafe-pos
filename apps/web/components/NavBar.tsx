"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, apiFetchJson, type CurrentUser } from "../lib/api";
import { useCafeSettings, API_BASE } from "../lib/CafeSettingsContext";
import { IconLogout } from "./icons";
import { Dropdown } from "./ui/Dropdown";

const AVATAR_TONES = [
  "bg-avatar-1 text-avatar-1-ink",
  "bg-avatar-2 text-avatar-2-ink",
  "bg-avatar-3 text-avatar-3-ink",
  "bg-avatar-4 text-avatar-4-ink",
  "bg-avatar-5 text-avatar-5-ink",
];
function toneFor(id: number) {
  return AVATAR_TONES[id % AVATAR_TONES.length];
}

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [billedCount, setBilledCount] = useState(0);
  const { settings } = useCafeSettings();

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  useEffect(() => {
    let cancelled = false;
    function fetchBilledCount() {
      apiFetchJson<{ id: number }[]>("/orders?status=billed")
        .then((orders) => { if (!cancelled) setBilledCount(orders.length); })
        .catch(() => {});
    }
    fetchBilledCount();
    const interval = setInterval(fetchBilledCount, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const linkClass = (href: string) =>
    `rounded-full px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
      pathname === href
        ? "bg-brand-tint text-brand-strong"
        : "text-ink-secondary hover:bg-surface-sunken hover:text-ink-primary"
    }`;

  const cafeName = settings?.name ?? "Cafe POS";
  const logoUrl = settings?.logoUrl ? `${API_BASE}${settings.logoUrl}` : null;

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-surface-raised focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink-primary focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-focus-ring"
      >
        Skip to content
      </a>

      <nav
        aria-label="Main navigation"
        className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-border-subtle bg-surface-raised/95 px-4 py-3 backdrop-blur sm:px-6"
      >
        <div className="flex items-center gap-4">
          <span className="hidden items-center gap-1.5 font-display text-sm font-bold text-ink-primary sm:flex">
            {logoUrl ? (
              <img src={logoUrl} alt={cafeName} className="h-6 w-6 rounded object-cover" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
            )}
            {cafeName}
          </span>
          <div className="flex gap-1.5" role="list">
            <Link href="/" className={linkClass("/")} role="listitem">Tables</Link>
            <Link href="/kitchen" className={linkClass("/kitchen")} role="listitem">Kitchen</Link>
            <Link href="/billing" className={`${linkClass("/billing")} relative`} role="listitem">
              Billing
              {billedCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white">
                  {billedCount > 99 ? "99+" : billedCount}
                </span>
              )}
            </Link>
            {user?.role === "admin" && (
              <Link href="/admin" className={linkClass("/admin")} role="listitem">Admin</Link>
            )}
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 sm:flex">
              <span className="body-sm text-ink-secondary">
                <span className="font-semibold text-ink-primary">{user.name}</span> · {user.role}
              </span>
            </span>

            <Dropdown
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              align="right"
              trigger={
                <button
                  type="button"
                  aria-label={`${user.name} — open user menu`}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((o) => !o)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${toneFor(user.id)}`}
                >
                  {user.name.charAt(0).toUpperCase()}
                </button>
              }
              items={[{ label: "Log out", icon: IconLogout, onClick: handleLogout }]}
            />
          </div>
        )}
      </nav>
    </>
  );
}
