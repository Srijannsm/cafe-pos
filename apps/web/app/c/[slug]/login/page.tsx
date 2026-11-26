"use client";

// Staff login: pick your name, type your 4-digit PIN.
//
// Two steps on one page rather than two routes, so going "back" to the
// staff list is instant and the PIN never ends up in browser history.
// The cafe's own cover photo, logo and brand colour frame the page, so a
// waiter opening the app sees *their* cafe before anything else.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { publicFetchJson, setCafeSlug } from "../../../../lib/api";
import { applyBrand } from "../../../../lib/theme";
import { assetUrl } from "../../../../lib/format";
import { IconBackspace, IconChevronLeft, IconSearch } from "../../../../components/icons";
import { BrandMark, PoweredBy } from "../../../../components/brand/Brand";
import { StaffAvatar, initials } from "../../../../components/ui/StaffAvatar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const PIN_LENGTH = 4;

type StaffOption = { id: number; name: string; role: "admin" | "cashier" | "waiter" | string; avatarUrl?: string | null };
type CafeInfo = {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  themeColor: string | null;
  coverImageUrl: string | null;
  tagline: string | null;
  fontStyle: string | null;
};

const ROLE_LABEL: Record<string, string> = { admin: "Manager", cashier: "Cashier", waiter: "Waiter" };
const ROLE_ORDER: Record<string, number> = { waiter: 0, cashier: 1, admin: 2 };


const lastUserKey = (slug: string) => `lastStaff:${slug}`;

export default function CafeLoginPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();

  const [cafe, setCafe] = useState<CafeInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [staff, setStaff] = useState<StaffOption[] | null>(null);
  const [lastUserId, setLastUserId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StaffOption | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  // --- load cafe + staff -------------------------------------------------
  // publicFetchJson (not apiFetchJson): this page must work with no token,
  // and must never bounce itself on a 401 from a stale token.
  useEffect(() => {
    publicFetchJson<CafeInfo>(`/cafes/${slug}`)
      .then((info) => {
        setCafe(info);
        setCafeSlug(info.slug);
        applyBrand(info.themeColor, info.fontStyle);
      })
      .catch(() => setNotFound(true));
    publicFetchJson<StaffOption[]>(`/cafes/${slug}/staff`)
      .then(setStaff)
      .catch(() => setStaff([]));
    try {
      const v = Number(localStorage.getItem(lastUserKey(slug)));
      if (v) setLastUserId(v);
    } catch {
      // Private mode / storage disabled: just don't pre-sort anyone first.
    }
  }, [slug]);

  // Clock in the side panel -- set in an effect to avoid a hydration mismatch.
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Last person who logged in on this device first, then waiters -> manager.
  const sortedStaff = useMemo(() => {
    if (!staff) return null;
    const q = query.trim().toLowerCase();
    return staff
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.id === lastUserId) return -1;
        if (b.id === lastUserId) return 1;
        return (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.name.localeCompare(b.name);
      });
  }, [staff, query, lastUserId]);

  // --- login -------------------------------------------------------------
  const submit = useCallback(
    async (pinValue: string, person: StaffOption) => {
      setSubmitting(true);
      setError("");
      try {
        // Plain fetch on purpose: the shared apiFetch treats any 401 as
        // "session expired" and reloads the page, which would swallow the
        // "wrong PIN" message.
        const res = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cafeSlug: slug, userId: person.id, pin: pinValue }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { message?: string } | null;
          throw new Error(
            res.status === 429 ? body?.message ?? "Too many attempts. Wait a minute and try again." : "Wrong PIN. Try again.",
          );
        }
        const result = (await res.json()) as {
          accessToken: string;
          user: { id: number; name: string; role: string; cafeId: number };
        };
        localStorage.setItem("accessToken", result.accessToken);
        localStorage.setItem("currentUser", JSON.stringify(result.user));
        localStorage.setItem(lastUserKey(slug), String(person.id));
        router.push("/");
      } catch (e) {
        const msg = e instanceof TypeError ? "Can't reach the server. Check the connection." : (e as Error).message;
        setError(msg);
        setPin("");
        setShake(true);
        setTimeout(() => setShake(false), 350);
        setSubmitting(false);
      }
    },
    [router, slug],
  );

  const press = useCallback(
    (key: string) => {
      if (!selected || submitting) return;
      setError("");
      if (key === "back") return setPin(pin.slice(0, -1));
      if (pin.length >= PIN_LENGTH) return;
      const next = pin + key;
      setPin(next);
      // Kept outside a setState updater: React may run updaters twice in dev,
      // which would send the login request twice.
      if (next.length === PIN_LENGTH) void submit(next, selected);
    },
    [pin, selected, submitting, submit],
  );

  const back = useCallback(() => {
    setSelected(null);
    setPin("");
    setError("");
  }, []);

  // Physical keyboard on a laptop/tablet with a keyboard: digits, Backspace, Esc.
  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Escape") back();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, press, back]);

  function pick(person: StaffOption) {
    setSelected(person);
    setPin("");
    setError("");
  }

  // --- render ------------------------------------------------------------
  if (notFound) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface-canvas p-6 text-center">
        <BrandMark className="h-12 w-12" />
        <h1 className="text-xl font-semibold text-ink-primary">We can&apos;t find that cafe</h1>
        <p className="max-w-sm text-sm text-ink-secondary">
          The link may be mistyped, or the cafe is paused. Ask your manager for the right login link.
        </p>
      </main>
    );
  }

  const logo = assetUrl(cafe?.logoUrl);
  const cover = assetUrl(cafe?.coverImageUrl);

  return (
    <main className="grid min-h-screen bg-surface-canvas lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* ---------- Brand panel (desktop / tablet landscape) ---------- */}
      <aside className="relative hidden overflow-hidden bg-brand lg:block">
        {cover && (
          <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div
          className={`absolute inset-0 ${cover ? "bg-gradient-to-t from-black/80 via-black/30 to-black/10" : "bg-gradient-to-br from-black/0 to-black/30"}`}
        />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <CafeLogo logo={logo} name={cafe?.name} className="h-14 w-14 rounded-2xl ring-1 ring-white/30" />
          <div>
            {now && (
              <p className="tabular text-6xl font-semibold tracking-tight">
                {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </p>
            )}
            {now && (
              <p className="mt-1 text-white/70">
                {now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
              </p>
            )}
            <h1 className="mt-8 font-display text-3xl font-semibold leading-tight">{cafe?.name ?? " "}</h1>
            {cafe?.tagline && <p className="mt-1 max-w-md text-white/75">{cafe.tagline}</p>}
          </div>
        </div>
      </aside>

      {/* ---------- Main panel ---------- */}
      <section className="flex min-h-screen flex-col">
        {/* Mobile header: cover strip + logo */}
        <header className="relative lg:hidden">
          <div className="relative h-32 overflow-hidden bg-brand">
            {cover && (
              <img src={cover} alt="" className="h-full w-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          </div>
          <div className="relative -mt-8 px-5">
            <CafeLogo logo={logo} name={cafe?.name} className="h-16 w-16 rounded-2xl ring-4 ring-surface-canvas" />
            <div className="mt-2">
              <h1 className="font-display text-lg font-semibold leading-tight text-ink-primary">{cafe?.name ?? " "}</h1>
              {cafe?.tagline && <p className="text-xs text-ink-secondary">{cafe.tagline}</p>}
            </div>
          </div>
        </header>

        <div className="flex flex-1 items-start justify-center px-5 py-8 lg:items-center lg:px-10">
          {!selected ? (
            <StaffPicker
              staff={sortedStaff}
              total={staff?.length ?? 0}
              lastUserId={lastUserId}
              query={query}
              onQuery={setQuery}
              onPick={pick}
            />
          ) : (
            <PinPad
              person={selected}
              pin={pin}
              error={error}
              shake={shake}
              submitting={submitting}
              onPress={press}
              onBack={back}
            />
          )}
        </div>

        <footer className="flex flex-col items-center gap-2 px-5 pb-5 text-xs text-ink-faint sm:flex-row sm:justify-between">
          <span>Forgot your PIN? Ask your manager to reset it.</span>
          <PoweredBy />
        </footer>
      </section>
    </main>
  );
}

// -------------------------------------------------------------------------

function CafeLogo({ logo, name, className = "" }: { logo: string | null; name?: string; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden bg-surface-raised text-xl shadow-sm ${className}`}>
      {logo ? (
        <img src={logo} alt={name ?? ""} className="h-full w-full object-cover" />
      ) : (
        <span className="font-semibold text-brand-strong">{name ? initials(name) : ""}</span>
      )}
    </span>
  );
}

function StaffPicker({
  staff,
  total,
  lastUserId,
  query,
  onQuery,
  onPick,
}: {
  staff: StaffOption[] | null;
  total: number;
  lastUserId: number | null;
  query: string;
  onQuery: (q: string) => void;
  onPick: (p: StaffOption) => void;
}) {
  return (
    <div className="w-full max-w-2xl animate-card-in">
      <h2 className="text-2xl font-semibold text-ink-primary">Who&apos;s on shift?</h2>
      <p className="mt-1 text-sm text-ink-secondary">Tap your name to sign in.</p>

      {/* Search only earns its space once the list gets long. */}
      {total > 8 && (
        <label className="relative mt-5 block">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Find your name"
            className="h-11 w-full rounded-xl border border-border-subtle bg-surface-raised pl-9 pr-3 text-sm text-ink-primary outline-none placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {staff === null
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[132px] animate-pulse rounded-2xl bg-surface-sunken" />
            ))
          : staff.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p)}
                className="group relative flex flex-col items-center gap-2 rounded-2xl border border-border-subtle bg-surface-raised px-3 pb-5 pt-7 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.97]"
              >
                {p.id === lastUserId && (
                  <span className="absolute right-2 top-2 rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-medium text-brand-strong">
                    Last here
                  </span>
                )}
                <StaffAvatar id={p.id} name={p.name} avatarUrl={p.avatarUrl} className="h-14 w-14 text-lg" />
                <span className="w-full truncate font-medium text-ink-primary">{p.name}</span>
                <span className="text-xs text-ink-secondary">{ROLE_LABEL[p.role] ?? p.role}</span>
              </button>
            ))}
      </div>

      {staff && staff.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-border-subtle p-6 text-center text-sm text-ink-secondary">
          {query ? `Nobody called “${query}”.` : "No staff accounts yet. The cafe admin can add staff from Admin → Staff."}
        </p>
      )}
    </div>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

function PinPad({
  person,
  pin,
  error,
  shake,
  submitting,
  onPress,
  onBack,
}: {
  person: StaffOption;
  pin: string;
  error: string;
  shake: boolean;
  submitting: boolean;
  onPress: (k: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex w-full max-w-xs animate-card-in flex-col items-center">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1 self-start rounded-lg px-2 py-1 text-sm text-ink-secondary transition hover:bg-surface-sunken hover:text-ink-primary"
      >
        <IconChevronLeft className="h-4 w-4" /> Not you?
      </button>

      <StaffAvatar id={person.id} name={person.name} avatarUrl={person.avatarUrl} className="h-20 w-20 text-2xl ring-4 ring-surface-raised shadow-md" />
      <h2 className="mt-3 text-xl font-semibold text-ink-primary">Hi, {person.name.split(" ")[0]}</h2>
      <p className="text-sm text-ink-secondary">Enter your {PIN_LENGTH}-digit PIN</p>

      <div className={`mt-6 flex gap-4 ${shake ? "animate-shake" : ""}`} aria-live="polite" aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full transition-all duration-150 ${
              error ? "bg-status-danger" : i < pin.length ? "scale-110 bg-brand" : "bg-border-strong"
            }`}
          />
        ))}
      </div>

      <p className={`mt-3 h-5 text-sm ${error ? "text-status-danger-ink" : "text-ink-faint"}`} role={error ? "alert" : undefined}>
        {error || (submitting ? "Signing in…" : "")}
      </p>

      <div className="mt-4 grid w-full grid-cols-3 gap-3">
        {KEYS.map((key, i) =>
          key === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={submitting}
              onClick={() => onPress(key)}
              aria-label={key === "back" ? "Delete last digit" : key}
              className={`flex h-16 items-center justify-center rounded-2xl text-2xl font-medium transition active:scale-95 disabled:opacity-50 sm:h-[72px] ${
                key === "back"
                  ? "text-ink-secondary hover:bg-surface-sunken"
                  : "border border-border-subtle bg-surface-raised text-ink-primary shadow-sm hover:bg-surface-hover"
              }`}
            >
              {key === "back" ? <IconBackspace className="h-6 w-6" /> : <span className="tabular">{key}</span>}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
