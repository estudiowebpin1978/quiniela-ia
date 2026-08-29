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

// ─── Plan constants (single source of truth) ─────────────────────────────────

export const PLAN_DAYS: Record<string, number> = {
  "15_days": 15,
  "30_days": 30,
}

export const PLAN_AMOUNTS: Record<string, number> = {
  "15_days": 7000,
  "30_days": 10000,
}

export const AMOUNT_PLAN_MAP: Record<string, string> = {
  "7000": "15_days",
  "10000": "30_days",
}

/** Ollama local AI configuration */
export function getOllamaHost(): string {
  return env("OLLAMA_HOST") || "http://localhost:11434";
}

export function getOllamaModel(): string {
  return env("OLLAMA_MODEL") || "llama3.2:3b";
}

/** Check if Ollama is configured and reachable */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${getOllamaHost()}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Check if env vars are configured */
export function isConfigured(): boolean {
  return !!getSupabaseUrl() && !!getSupabaseKey();
}
