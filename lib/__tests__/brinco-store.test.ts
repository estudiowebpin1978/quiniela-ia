import { beforeEach, describe, expect, it, vi } from "vitest"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { cargarSorteosBrinco } from "@/lib/brinco/store"

vi.mock("@/lib/supabase-client", () => ({
  getSupabaseAdmin: vi.fn(),
}))

describe("brinco/store", () => {
  beforeEach(() => vi.clearAllMocks())

  it("solo carga sorteos oficialmente verificados o corroborados para predicción", async () => {
    const rows = [
      { concurso: 1200, fecha: "2026-01-04", tradicional: [1, 2, 3, 4, 5, 6], junior: null },
    ]
    const query = {
      select: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.in.mockReturnValue(query)
    query.order.mockResolvedValue({ data: rows, error: null })
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn().mockReturnValue(query),
    } as never)

    await expect(cargarSorteosBrinco()).resolves.toEqual(rows)
    expect(query.in).toHaveBeenCalledWith("estado_verificacion", ["verified_official", "cross_checked"])
  })
})
