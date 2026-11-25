"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { platformLogout } from "../../lib/api";
import { IconGrid, IconStore, IconPlus, IconMenu, IconLogout, IconChevronDown, IconX, IconCalendar, IconTag } from "../icons";

const NAV = [
  { label: "Overview", href: "/platform", icon: IconGrid },
  { label: "Cafes", href: "/platform/cafes", icon: IconStore },
  { label: "Renewals", href: "/platform/cafes?view=renewals", icon: IconCalendar },
  { label: "Plans", href: "/platform/plans", icon: IconTag },
];

// Same layout as the cafe admin (AdminShell) so it feels like one product,
// but with a dark sidebar: this is the internal, cross-tenant panel and it
// should never be mistaken for a cafe's own admin.
export function PlatformShell({ username, children }: { username: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setMobileOpen(false);
    setSearch(window.location.search);
  }, [pathname]);

  const active = (href: string) => {
    const [path, q] = href.split("?");
    if (q) return pathname === path && search.includes(q);
    if (path === "/platform") return pathname === "/platform";
    return pathname.startsWith(path!) && !search.includes("view=");
  };

  return (
    <div className="min-h-screen bg-surface-canvas">
      {mobileOpen && <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 bg-overlay-backdrop lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed left-0 top-0 z-50 flex h-screen w-[260px] flex-col bg-[#0c111d] px-4 text-white transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 px-2 py-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-bold text-[#0c111d]">☕</span>
          <div className="flex-1">
            <p className="text-sm font-semibold">Cafe POS</p>
            <p className="text-[11px] uppercase tracking-widest text-white/50">Platform</p>
          </div>
          <button type="button" aria-label="Close" className="rounded-lg p-1.5 text-white/60 lg:hidden" onClick={() => setMobileOpen(false)}><IconX className="h-5 w-5" /></button>
        </div>
        <Link href="/platform/cafes?new=1" className="mb-6 flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-semibold text-[#0c111d] transition hover:bg-white/90">
          <IconPlus className="h-4 w-4" /> Onboard cafe
        </Link>
        <nav className="flex-1 space-y-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active(n.href) ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"}`}>
              <n.icon className="h-5 w-5" /> {n.label}
            </Link>
          ))}
        </nav>
        <p className="border-t border-white/10 py-4 text-xs text-white/40">Internal · cross-tenant access</p>
      </aside>

      <div className="flex min-h-screen flex-col lg:ml-[260px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border-subtle bg-surface-raised/95 px-4 backdrop-blur sm:px-6">
          <button type="button" aria-label="Open menu" onClick={() => setMobileOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle text-ink-secondary lg:hidden">
            <IconMenu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <div className="relative">
            <button type="button" onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 hover:bg-surface-sunken">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-primary text-sm font-semibold text-white">{username.charAt(0).toUpperCase()}</span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-medium leading-tight">{username}</span>
                <span className="block text-xs leading-tight text-ink-faint">Superadmin</span>
              </span>
              <IconChevronDown className="hidden h-4 w-4 text-ink-faint sm:block" />
            </button>
            {menuOpen && (
              <>
                <button type="button" aria-label="Close" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-2xl border border-border-subtle bg-surface-overlay p-1.5 shadow-lg">
                  <button type="button" onClick={() => { platformLogout(); router.push("/platform/login"); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-sunken">
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
