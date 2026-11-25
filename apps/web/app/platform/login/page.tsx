"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { platformLogin } from "../../../lib/api";
import { Button } from "../../../components/ui/Button";
import { Field, inputClass } from "../../../components/ui/Field";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await platformLogin(username, password);
      router.push("/platform");
    } catch {
      setError("Invalid username or password");
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mb-8 mt-1 text-sm text-ink-secondary">Platform admin — internal access only.</p>
          <div className="space-y-4">
            <Field label="Username">
              <input autoFocus autoComplete="username" className={`${inputClass} w-full`} value={username} onChange={(e) => setUsername(e.target.value)} required />
            </Field>
            <Field label="Password">
              <input type="password" autoComplete="current-password" className={`${inputClass} w-full`} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error && <p className="rounded-lg bg-status-danger-tint px-3 py-2 text-sm text-status-danger-ink">{error}</p>}
            <Button type="submit" className="w-full" loading={submitting} disabled={!username || !password}>Sign in</Button>
          </div>
        </form>
      </div>
      <div className="hidden flex-col justify-between bg-[#0c111d] p-12 text-white lg:flex">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-lg">☕</span>
        <div>
          <p className="text-3xl font-semibold leading-tight">Every cafe on the platform,<br />in one place.</p>
          <p className="mt-3 max-w-md text-white/60">Onboard new cafes, track trials and renewals, and see who needs a call this week.</p>
        </div>
        <p className="text-xs text-white/40">Cafe POS · Platform</p>
      </div>
    </main>
  );
}
