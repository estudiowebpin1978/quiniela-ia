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
