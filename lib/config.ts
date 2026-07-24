/**
 * Shared configuration — single source of truth.
 * Import this module instead of hardcoding values across the codebase.
 */

export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "estudiowebpin@gmail.com")
  .split(",")
  .map(e => e.trim().toLowerCase());

export function isAdminEmail(email: string | null | undefined): boolean {
  return ADMIN_EMAILS.includes((email || "").toLowerCase());
}

/** Safe env accessor — returns trimmed string or empty */
export function env(key: string): string {
  return (process.env[key] || "").replace(/"/g, "").trim();
}

export function getSupabaseUrl(): string {
  return env("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabaseKey(): string {
  return env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_KEY");
}

/** Returns headers for Supabase REST API calls */
export function sbHeaders(): Record<string, string> {
  const key = getSupabaseKey();
  return { "apikey": key, "Authorization": `Bearer ${key}` };
}

/** Check if env vars are configured */
export function isConfigured(): boolean {
  return !!getSupabaseUrl() && !!getSupabaseKey();
}
