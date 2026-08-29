/**
 * Tests: Webhook Ualá Bis — Payment Processing
 */

const mockUsers = new Map<string, { id: string; role: string; premium_until: string | null }>()
const mockWebhookLogs: Array<{ order_id: string; status: string; user_id: string }> = []

jest.mock("@/lib/supabase-client", () => {
  return {
    getSupabaseAdmin: jest.fn(() => {
      return {
        from: jest.fn((table: string) => {
          let _userId: string | null = null
          let _selectMode = false
          let _updatePayload: Record<string, unknown> | null = null

          const chain: Record<string, unknown> = {}
          chain.select = jest.fn(() => { _selectMode = true; return chain })
          chain.insert = jest.fn(async (data: Record<string, unknown>) => {
            if (table === "webhook_logs") {
              const exists = mockWebhookLogs.find(l => l.order_id === data.order_id)
              if (exists) return { error: { code: "23505", message: "unique" } }
              mockWebhookLogs.push({
                order_id: data.order_id as string,
                status: data.status as string,
                user_id: data.user_id as string,
              })
            }
            if (table === "user_profiles" && data.id) {
              mockUsers.set(data.id as string, {
                id: data.id as string,
                role: (data.role as string) || "free",
                premium_until: (data.premium_until as string) || null,
              })
            }
            return { error: null }
          })
          chain.update = jest.fn((data: Record<string, unknown>) => { _updatePayload = data; return chain })
          chain.eq = jest.fn((_field: string, value: unknown) => {
            if (_field === "id") _userId = value as string
            if (_updatePayload) {
              const user = _userId ? mockUsers.get(_userId) : null
              if (user) Object.assign(user, _updatePayload)
              return Promise.resolve({ data: null, error: null })
            }
            return chain
          })
          chain.limit = jest.fn(() => {
            const user = _userId ? mockUsers.get(_userId) : null
            return { data: user ? [user] : [], error: null }
          })
          chain.order = jest.fn(() => chain)
          chain.single = jest.fn(async () => {
            const user = _userId ? mockUsers.get(_userId) : null
            return { data: user || null, error: user ? null : { message: "not found" } }
          })
          return chain
        }),
      }
    }),
  }
})

jest.mock("@/lib/config", () => ({
  PLAN_DAYS: { "15_days": 15, "30_days": 30 },
  AMOUNT_PLAN_MAP: { "7000": "15_days", "10000": "30_days" },
}))

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}))

function createMockRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const rawBody = JSON.stringify(body)
  return {
    text: async () => rawBody,
    headers: {
      get: (name: string) => {
        if (name === "x-forwarded-for") return "127.0.0.1"
        return headers[name] || null
      },
    },
  } as unknown as import("next/server").NextRequest
}

function generateHmacSignature(body: string): string {
  const { createHmac } = require("crypto")
  return createHmac("sha256", "test-uala-webhook-secret").update(body).digest("hex")
}

describe("Webhook Ualá Bis — Payment Processing", () => {
  beforeEach(async () => {
    mockUsers.clear()
    mockWebhookLogs.length = 0
    mockUsers.set("a1b2c3d4-e5f6-7890-abcd-ef1234567890", {
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      role: "free",
      premium_until: null,
    })

    global.fetch = jest.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString()
      if (urlStr.includes("auth/token")) {
        return { ok: true, json: async () => ({ access_token: "mock-token" }) } as Response
      }
      if (urlStr.includes("/orders/")) {
        return {
          ok: true,
          json: async () => ({
            status: "APPROVED",
            amount: 10000,
            external_reference: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          }),
        } as Response
      }
      return { ok: false } as Response
    }) as typeof fetch
  })

  afterEach(() => { jest.restoreAllMocks() })

  it("should upgrade user to premium on valid APPROVED payment", async () => {
    const payload = { id: "order-001", status: "APPROVED", external_reference: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", amount: 10000 }
    const rawBody = JSON.stringify(payload)
    const signature = generateHmacSignature(rawBody)
    const req = createMockRequest(payload, { "x-signature": signature })

    const { POST } = await import("@/app/api/webhook-uala/route")
    const res = await POST(req)
    const json = await res.json()

    expect(json.ok).toBe(true)
    const user = mockUsers.get("a1b2c3d4-e5f6-7890-abcd-ef1234567890")
    expect(user).toBeDefined()
    expect(user!.role).toBe("premium")
    expect(user!.premium_until).not.toBeNull()
  })

  it("should reject invalid HMAC signature", async () => {
    const payload = { id: "order-002", status: "APPROVED", external_reference: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", amount: 10000 }
    const req = createMockRequest(payload, { "x-signature": "invalid-signature-here" })

    const { POST } = await import("@/app/api/webhook-uala/route")
    const res = await POST(req)
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(mockUsers.get("a1b2c3d4-e5f6-7890-abcd-ef1234567890")!.role).toBe("free")
  })

  it("should ignore non-approved status", async () => {
    const payload = { id: "order-003", status: "PENDING", external_reference: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", amount: 10000 }
    const rawBody = JSON.stringify(payload)
    const signature = generateHmacSignature(rawBody)
    const req = createMockRequest(payload, { "x-signature": signature })

    const { POST } = await import("@/app/api/webhook-uala/route")
    const res = await POST(req)
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(mockUsers.get("a1b2c3d4-e5f6-7890-abcd-ef1234567890")!.role).toBe("free")
  })

  it("should ignore payload with no orderId", async () => {
    const payload = { status: "APPROVED", external_reference: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", amount: 10000 }
    const rawBody = JSON.stringify(payload)
    const signature = generateHmacSignature(rawBody)
    const req = createMockRequest(payload, { "x-signature": signature })

    const { POST } = await import("@/app/api/webhook-uala/route")
    const res = await POST(req)
    const json = await res.json()

    expect(json.ok).toBe(true)
  })

  it("should skip unknown amount", async () => {
    global.fetch = jest.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString()
      if (urlStr.includes("auth/token")) return { ok: true, json: async () => ({ access_token: "mock-token" }) } as Response
      if (urlStr.includes("/orders/")) return { ok: true, json: async () => ({ status: "APPROVED", amount: 99999, external_reference: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }) } as Response
      return { ok: false } as Response
    }) as typeof fetch

    const payload = { id: "order-004", status: "APPROVED", external_reference: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", amount: 99999 }
    const rawBody = JSON.stringify(payload)
    const signature = generateHmacSignature(rawBody)
    const req = createMockRequest(payload, { "x-signature": signature })

    const { POST } = await import("@/app/api/webhook-uala/route")
    const res = await POST(req)
    const json = await res.json()

    expect(json.ok).toBe(true)
  })

  it("should skip admin users", async () => {
    mockUsers.set("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "admin", premium_until: "2099-01-01" })

    global.fetch = jest.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString()
      if (urlStr.includes("auth/token")) return { ok: true, json: async () => ({ access_token: "mock-token" }) } as Response
      if (urlStr.includes("/orders/")) return { ok: true, json: async () => ({ status: "APPROVED", amount: 10000, external_reference: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }) } as Response
      return { ok: false } as Response
    }) as typeof fetch

    const payload = { id: "order-005", status: "APPROVED", external_reference: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", amount: 10000 }
    const rawBody = JSON.stringify(payload)
    const signature = generateHmacSignature(rawBody)
    const req = createMockRequest(payload, { "x-signature": signature })

    const { POST } = await import("@/app/api/webhook-uala/route")
    const res = await POST(req)
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(mockUsers.get("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")!.role).toBe("admin")
  })
})
