import { afterEach, describe, expect, it, vi } from "vitest"
import { getAppBaseUrl } from "@/lib/app-url"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("getAppBaseUrl", () => {
  it("uses the Railway-provided public domain", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "quiniela.example")
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "")

    expect(getAppBaseUrl()).toBe("https://quiniela.example")
  })

  it("uses an explicitly configured HTTPS origin", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://quiniela.example/path")
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "")

    expect(getAppBaseUrl()).toBe("https://quiniela.example")
  })

  it("fails clearly instead of using a stale production URL", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "")
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "")
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "")
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "")
    vi.stubEnv("VERCEL_URL", "")

    expect(() => getAppBaseUrl()).toThrow(/App URL is not configured/)
  })
})
