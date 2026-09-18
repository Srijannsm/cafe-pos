"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson } from "../../lib/api";
import { NumericKeypad } from "../../components/NumericKeypad";

type StaffOption = {
  id: number;
  name: string;
  role: string;
};

const AVATAR_TONES = [
  "bg-orange-100 text-orange-800",
  "bg-blue-100 text-blue-800",
  "bg-emerald-100 text-emerald-800",
  "bg-violet-100 text-violet-800",
  "bg-rose-100 text-rose-800",
];

function toneFor(id: number) {
  return AVATAR_TONES[id % AVATAR_TONES.length];
}

export default function LoginPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetchJson<StaffOption[]>("/users/login-options")
      .then(setStaff)
      .finally(() => setLoadingStaff(false));
  }, []);

  function selectPerson(id: number) {
    setSelectedUserId(id);
    setPin("");
    setError("");
  }

  async function handleLogin(pinValue: string) {
    setSubmitting(true);
    setError("");
    try {
      const result = await apiFetchJson<{ accessToken: string; user: { id: number; name: string; role: string } }>(
        "/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: selectedUserId, pin: pinValue }),
        },
      );
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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b from-stone-50 to-stone-100 p-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-white">
          ☕
        </div>
        <h1 className="text-2xl font-bold text-stone-900">Who&apos;s working today?</h1>
        <p className="mt-1 text-sm text-stone-500">Tap your name, then enter your PIN</p>
      </div>

      {loadingStaff ? (
        <div className="flex flex-wrap justify-center gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 w-28 animate-pulse rounded-2xl bg-stone-200" />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-3">
          {staff.map((person) => (
            <button
              key={person.id}
              onClick={() => selectPerson(person.id)}
              className={`flex w-28 flex-col items-center gap-2 rounded-2xl border-2 p-4 text-center transition active:scale-95 ${
                selectedUserId === person.id
                  ? "border-primary bg-primary-subtle shadow-sm"
                  : "border-transparent bg-white shadow-sm hover:border-stone-200"
              }`}
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold ${toneFor(person.id)}`}
              >
                {person.name.charAt(0).toUpperCase()}
              </span>
              <span className="text-sm font-semibold text-stone-900">{person.name}</span>
              <span className="text-xs uppercase tracking-wide text-stone-500">{person.role}</span>
            </button>
          ))}
        </div>
      )}

      {selectedPerson && (
        <div className="animate-card-in flex flex-col items-center gap-4 rounded-2xl bg-white p-6 shadow-md">
          <p className="text-sm text-stone-500">
            Enter PIN for <span className="font-semibold text-stone-800">{selectedPerson.name}</span>
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
            <p className="rounded-lg bg-danger-subtle px-3 py-2 text-sm font-medium text-danger-subtle-fg">{error}</p>
          )}
        </div>
      )}
    </main>
  );
}
