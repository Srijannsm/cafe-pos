"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout } from "../lib/api";

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getCurrentUser();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const linkClass = (href: string) =>
    `rounded-lg px-3 py-2 text-sm font-medium ${
      pathname === href ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"
    }`;

  return (
    <nav className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
      <div className="flex gap-2">
        <Link href="/" className={linkClass("/")}>
          Tables
        </Link>
        <Link href="/kitchen" className={linkClass("/kitchen")}>
          Kitchen
        </Link>
      </div>
      {user && (
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>
            {user.name} · {user.role}
          </span>
          <button onClick={handleLogout} className="font-medium text-blue-600 hover:underline">
            Log out
          </button>
        </div>
      )}
    </nav>
  );
}
