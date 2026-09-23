"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiFetchJson, setCafeSlug } from "../../../../lib/api";
import { NumericKeypad } from "../../../../components/NumericKeypad";
import { InlineAlert } from "../../../../components/ui/InlineAlert";
import { Skeleton } from "../../../../components/ui/Skeleton";

type StaffOption = {
  id: number;
  name: string;
  role: string;
};

type CafeInfo = {
  id: number;
  name: string;
  slug: string;
};

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

export default function CafeLoginPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [cafe, setCafe] = useState<CafeInfo | null>(null);
  const [cafeError, setCafeError] = useState(false);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetchJson<CafeInfo>(`/cafes/${slug}`)
      .then((info) => {
        setCafe(info);
        // Remembered so a later expired token knows which cafe's login
        // screen to bounce back to, without the user re-typing this URL.
        setCafeSlug(info.slug);
      })
      .catch(() => setCafeError(true));

    apiFetchJson<StaffOption[]>(`/cafes/${slug}/staff`)
      .then(setStaff)
      .catch(() => setStaff([]))
      .finally(() => setLoadingStaff(false));
  }, [slug]);

  function selectPerson(id: number) {
    setSelectedUserId(id);
    setPin("");
    setError("");
  }

  async function handleLogin(pinValue: string) {
    setSubmitting(true);
    setError("");
    try {
      const result = await apiFetchJson<{
        accessToken: string;
        user: { id: number; name: string; role: string; cafeId: number };
      }>("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cafeSlug: slug, userId: selectedUserId, pin: pinValue }),
      });
      localStorage.setItem("accessToken", result.accessToken);
      localStorage.setItem("currentUser", JSON.stringify(result.user));
      router.push("/");
    } catch {
      setError("Invalid PIN, please try again");
      setPin("");
      setShake(true);
      setTimeout(() => setShake(false), 350);
      setSubmitting(false);
    }
  }

  const selectedPerson = staff.find((p) => p.id === selectedUserId) ?? null;

  if (cafeError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gradient-to-b from-surface-canvas to-surface-sunken p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand text-lg font-bold text-on-brand">
          ☕
        </div>
        <h1 className="heading-lg text-ink-primary">We can&apos;t find that cafe</h1>
        <p className="body-md text-ink-secondary">
          Double-check the link your manager gave you, or ask them for the right one.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b from-surface-canvas to-surface-sunken p-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-brand text-lg font-bold text-on-brand">
          ☕
        </div>
        <h1 className="heading-lg text-ink-primary">{cafe ? cafe.name : "Who’s working today?"}</h1>
        <p className="body-md mt-1 text-ink-secondary">Tap your name, then enter your PIN</p>
      </div>

      {loadingStaff ? (
        <div className="flex flex-wrap justify-center gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rect" className="h-28 w-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-3">
          {staff.map((person) => (
            <button
              key={person.id}
              onClick={() => selectPerson(person.id)}
              className={`flex w-28 flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition active:scale-95 ${
                selectedUserId === person.id
                  ? "border-brand bg-brand-tint shadow-sm"
                  : "border-transparent bg-surface-raised shadow-sm hover:border-border-subtle"
              }`}
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold ${toneFor(person.id)}`}
              >
                {person.name.charAt(0).toUpperCase()}
              </span>
              <span className="body-md font-semibold text-ink-primary">{person.name}</span>
              <span className="label-sm text-ink-secondary">{person.role}</span>
            </button>
          ))}
        </div>
      )}

      {selectedPerson && (
        <div className="animate-card-in flex flex-col items-center gap-4 rounded-xl bg-surface-raised p-6 shadow-md">
          <p className="body-md text-ink-secondary">
            Enter PIN for <span className="font-semibold text-ink-primary">{selectedPerson.name}</span>
          </p>

          <NumericKeypad
            value={pin}
            maxLength={4}
            shake={shake}
            onChange={(next) => {
              if (submitting) return;
              setPin(next);
              setError("");
              if (next.length === 4) handleLogin(next);
            }}
          />

          {error && (
            <InlineAlert>{error}</InlineAlert>
          )}
        </div>
      )}
    </main>
  );
}
