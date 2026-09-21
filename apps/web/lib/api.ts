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

// Separate from the staff PIN-login auth above: the internal superadmin
// panel (apps/web/app/platform) has its own login (username/password, see
// PlatformAuthModule) and its own token, kept in its own localStorage key
// so a platform session and a cafe staff session never get confused.
const PLATFORM_TOKEN_KEY = "platformToken";

export type PlatformUser = {
  id: number;
  username: string;
};

export function getPlatformToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PLATFORM_TOKEN_KEY);
}

export function platformLogout() {
  localStorage.removeItem(PLATFORM_TOKEN_KEY);
  localStorage.removeItem("platformUser");
}

export function getCurrentPlatformUser(): PlatformUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("platformUser");
  return raw ? JSON.parse(raw) : null;
}

export async function platformLogin(username: string, password: string): Promise<PlatformUser> {
  const res = await fetch(`${API_URL}/platform/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    throw new Error("Invalid username or password");
  }

  const result: { accessToken: string; user: PlatformUser } = await res.json();
  localStorage.setItem(PLATFORM_TOKEN_KEY, result.accessToken);
  localStorage.setItem("platformUser", JSON.stringify(result.user));
  return result.user;
}


// The public self-ordering flow has no session at all -- the qrToken in
// the URL path is the only credential -- so this never attaches a token
// and never redirects on 401. A bad or expired link should just show an
// error on the page the customer is already looking at.
export async function publicFetchJson<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, options);

  if (!res.ok) {
    const serverMessage = await res
      .json()
      .then((body: { message?: string | string[] }) =>
        typeof body?.message === "string" ? body.message : Array.isArray(body?.message) ? body.message.join(", ") : null,
      )
      .catch(() => null);
    throw new Error(serverMessage ?? `Request failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export async function platformFetchJson<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getPlatformToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    platformLogout();
    window.location.href = "/platform/login";
    throw new Error("Platform session expired");
  }

  if (!res.ok) {
    const serverMessage = await res
      .json()
      .then((body: { message?: string | string[] }) =>
        typeof body?.message === "string" ? body.message : Array.isArray(body?.message) ? body.message.join(", ") : null,
      )
      .catch(() => null);
    throw new Error(serverMessage ?? `Request failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}
