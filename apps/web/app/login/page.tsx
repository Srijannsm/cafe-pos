"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCafeSlug } from "../../lib/api";

// This bare /login route predates multi-tenancy. Staff now log in at
// /c/:slug/login, so this just forwards to the cafe this device last used
// (remembered in localStorage) -- and if we don't know one yet, it says so
// instead of guessing.
export default function LoginRedirectPage() {
  const router = useRouter();
  const [noCafeKnown, setNoCafeKnown] = useState(false);

  useEffect(() => {
    const slug = getCafeSlug();
    if (slug) {
      router.replace(`/c/${slug}/login`);
    } else {
      setNoCafeKnown(true);
    }
  }, [router]);

  if (!noCafeKnown) return null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gradient-to-b from-surface-canvas to-surface-sunken p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand text-lg font-bold text-on-brand">
        ☕
      </div>
      <h1 className="heading-lg text-ink-primary">We don&apos;t know which cafe this is</h1>
      <p className="body-md text-ink-secondary">
        Ask your manager for this cafe&apos;s login link -- it looks like /c/your-cafe/login.
      </p>
    </main>
  );
}
