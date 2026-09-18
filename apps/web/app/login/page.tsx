"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson } from "../../lib/api";

type StaffOption = {
  id: number;
  name: string;
  role: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetchJson<StaffOption[]>("/users/login-options").then(setStaff);
  }, []);

  async function handleLogin() {
  setError("");
  try {
    const result = await apiFetchJson<{ accessToken: string; user: { id: number; name: string; role: string } }>(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, pin }),
      },
    );
    localStorage.setItem("accessToken", result.accessToken);
    localStorage.setItem("currentUser", JSON.stringify(result.user));
    router.push("/");
  } catch {
    setError("Invalid PIN, please try again");
  }
}

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Who's working today?</h1>

      <div className="flex flex-wrap gap-3">
        {staff.map((person) => (
          <button
            key={person.id}
            onClick={() => setSelectedUserId(person.id)}
            className={`rounded-lg border px-4 py-3 ${
              selectedUserId === person.id
                ? "border-blue-600 bg-blue-50"
                : "border-gray-300"
            }`}
          >
            {person.name}
            <div className="text-xs text-gray-500">{person.role}</div>
          </button>
        ))}
      </div>

      {selectedUserId && (
        <div className="flex flex-col items-center gap-3">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-32 rounded-lg border border-gray-300 p-3 text-center text-2xl tracking-widest"
            placeholder="PIN"
          />
          <button
            onClick={handleLogin}
            className="rounded-lg bg-blue-600 px-6 py-2 text-white"
          >
            Log in
          </button>
          {error && <p className="text-red-600">{error}</p>}
        </div>
      )}
    </main>
  );
}