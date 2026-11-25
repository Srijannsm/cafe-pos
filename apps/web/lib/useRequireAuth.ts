"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function useRequireAuth(): boolean {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("accessToken")) {
      router.push("/login");
      return;
    }
    setReady(true);
  }, [router]);

  return ready;
}

/**
 * The logged-in staff member, read after mount. Reading localStorage during
 * render makes the server HTML differ from the first client render
 * (React hydration error #418), so it has to happen in an effect.
 */
export function useCurrentUser() {
  const [user, setUser] = useState<import("./api").CurrentUser | null>(null);
  useEffect(() => {
    const raw = localStorage.getItem("currentUser");
    setUser(raw ? JSON.parse(raw) : null);
  }, []);
  return user;
}
