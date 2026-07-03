/**
 * Auth token management — single source of truth.
 * Replaces scattered localStorage parsing across login/page.tsx, predictions/page.tsx, page.tsx.
 */

const TOKEN_KEY = "quiniela-ia-auth";

export interface AuthData {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  token_type?: string;
  user?: { id?: string; email?: string };
}

export function saveAuth(data: AuthData): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(data));
}

export function getAuth(): AuthData | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.access_token) return null;
    if (parsed.expires_at && parsed.expires_at < Math.floor(Date.now() / 1000)) {
      if (parsed.refresh_token) {
        return parsed;
      }
      clearAuth();
      return null;
    }
    return parsed;
  } catch {
    clearAuth();
    return null;
  }
}

export function getAccessToken(): string | null {
  return getAuth()?.access_token ?? null;
}

export async function refreshSession(): Promise<AuthData | null> {
  const auth = getAuth();
  if (!auth?.refresh_token) return null;
  try {
    const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim();
    const SB_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").replace(/"/g, "").trim();
    if (!SB_URL || !SB_KEY) return null;
    const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SB_KEY },
      body: JSON.stringify({ refresh_token: auth.refresh_token }),
    });
    if (!r.ok) { clearAuth(); return null; }
    const data = await r.json();
    const newAuth: AuthData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || auth.refresh_token,
      expires_at: data.expires_at,
      token_type: data.token_type || "bearer",
      user: data.user || auth.user,
    };
    saveAuth(newAuth);
    return newAuth;
  } catch {
    return null;
  }
}

export async function getValidToken(): Promise<string | null> {
  const auth = getAuth();
  if (!auth) return null;
  if (auth.expires_at && auth.expires_at < Math.floor(Date.now() / 1000) + 60) {
    const refreshed = await refreshSession();
    return refreshed?.access_token ?? null;
  }
  return auth.access_token;
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return getAccessToken() !== null;
}

// Guest mode
const GUEST_KEY = "quiniela-ia-guest";

export function setGuest(): void {
  localStorage.setItem(GUEST_KEY, "1");
}

export function isGuest(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearGuest(): void {
  localStorage.removeItem(GUEST_KEY);
}
