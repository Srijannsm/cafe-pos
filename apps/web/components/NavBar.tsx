"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, type CurrentUser } from "../lib/api";
import { IconLogout } from "./icons";

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const linkClass = (href: string) =>
    `rounded-full px-4 py-2.5 text-sm font-semibold transition ${
      pathname === href
        ? "bg-primary-subtle text-primary-subtle-fg"
        : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
    }`;

  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex items-center gap-4">
        <span className="hidden items-center gap-1.5 text-sm font-bold text-stone-900 sm:flex">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Cafe POS
        </span>
        <div className="flex gap-1.5">
          <Link href="/" className={linkClass("/")}>
            Tables
          </Link>
          <Link href="/kitchen" className={linkClass("/kitchen")}>
            Kitchen
          </Link>
          <Link href="/billing" className={linkClass("/billing")}>
            Billing
          </Link>
          {user?.role === "admin" && (
            <Link href="/admin" className={linkClass("/admin")}>
              Admin
            </Link>
          )}
        </div>
      </div>

      {user && (
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-200 text-xs font-bold text-stone-700">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <span className="text-sm text-stone-600">
              <span className="font-semibold text-stone-900">{user.name}</span> · {user.role}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
          >
            <IconLogout className="h-4 w-4" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      )}
    </nav>
  );
}
