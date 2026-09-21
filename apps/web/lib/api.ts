const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    logout();
    const slug = getCafeSlug();
    window.location.href = slug ? `/c/${slug}/login` : "/login";
    throw new Error(`API request failed: ${res.status} ${res.statusText} (${path})`);
  }

  if (!res.ok) {
    const serverMessage = await res
      .json()
      .then((body: { message?: string | string[] }) =>
        typeof body?.message === "string" ? body.message : Array.isArray(body?.message) ? body.message.join(", ") : null,
      )
      .catch(() => null);
    throw new Error(serverMessage ?? `API request failed: ${res.status} ${res.statusText} (${path})`);
  }

  return res;
}

export async function apiFetchJson<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options);
  return res.json() as Promise<T>;
}

export type CurrentUser = {
  id: number;
  name: string;
  role: string;
  cafeId: number;
};

export function getCurrentUser(): CurrentUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("currentUser");
  return raw ? JSON.parse(raw) : null;
}

// The cafe slug is tied to this device/browser, not to a particular staff
// session -- it's how we know which cafe's login screen to send someone
// back to after a logout or an expired token, without asking them to
// re-type their cafe's URL every time.
export function getCafeSlug(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("cafeSlug");
}

export function setCafeSlug(slug: string) {
  localStorage.setItem("cafeSlug", slug);
}

export function logout() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("currentUser");
}
