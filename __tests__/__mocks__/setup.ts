/**
 * Global Jest setup — mock environment variables and global fetch.
 */

// ── Env vars ─────────────────────────────────────────────────────────────────
process.env.SUPABASE_URL = "https://test.supabase.co"
process.env.SUPABASE_SERVICE_ROLE_KEY = "eyJ-test-service-role-key"
process.env.SUPABASE_ANON_KEY = "eyJ-test-anon-key"
process.env.SUPABASE_DB_PASSWORD = "test-password"
process.env.CRON_SECRET = "test-cron-secret"
process.env.UALA_WEBHOOK_SECRET = "test-uala-webhook-secret"
process.env.UALA_USERNAME = "test-uala-user"
process.env.UALA_CLIENT_ID = "test-client-id"
process.env.UALA_CLIENT_SECRET = "test-client-secret"

// ── Global fetch mock ────────────────────────────────────────────────────────
const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

// ── AbortSignal.timeout polyfill for Jest ────────────────────────────────────
if (!AbortSignal.timeout) {
  AbortSignal.timeout = (ms: number) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), ms)
    return controller.signal
  }
}
