"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { platformLogin } from "../../../lib/api";
import { IconKey } from "../../../components/icons";
import { Button } from "../../../components/ui/Button";
import { InlineAlert } from "../../../components/ui/InlineAlert";
import { Input } from "../../../components/ui/Input";

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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-surface-canvas to-surface-sunken p-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-brand text-on-brand">
          <IconKey className="h-5 w-5" />
        </div>
        <h1 className="heading-lg text-ink-primary">Platform admin</h1>
        <p className="body-md mt-1 text-ink-secondary">Internal only -- sign in to manage cafes.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-72 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="label-sm text-ink-faint">Username</label>
          <Input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="label-sm text-ink-faint">Password</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <InlineAlert>{error}</InlineAlert>}

        <Button type="submit" disabled={submitting || !username || !password}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
