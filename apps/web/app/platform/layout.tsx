"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getPlatformToken, getCurrentPlatformUser } from "../../lib/api";
import { PlatformShell } from "../../components/platform/PlatformShell";
import { Skeleton } from "../../components/ui/Skeleton";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ username: string } | null>(null);
  // The login page lives in this folder, so it must render without the
  // shell -- otherwise the auth check redirects it back to itself forever.
  const isLoginPage = pathname === "/platform/login";

  useEffect(() => {
    if (isLoginPage) return;
    const current = getPlatformToken() ? getCurrentPlatformUser() : null;
    if (!current) {
      router.replace("/platform/login");
      return;
    }
    setUser(current);
  }, [router, isLoginPage]);

  if (isLoginPage) return <>{children}</>;
  if (!user) {
    return <div className="flex min-h-screen items-center justify-center bg-surface-canvas"><Skeleton className="h-8 w-40 rounded-md" /></div>;
  }
  return <PlatformShell username={user.username}>{children}</PlatformShell>;
}
