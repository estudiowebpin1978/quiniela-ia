import { describe, expect, it } from "vitest"
import { classifyDrawFreshness } from "@/lib/cron/freshness"

describe("classifyDrawFreshness", () => {
  it("flags daily draws after the expected update window", () => {
    expect(classifyDrawFreshness(31 * 60)).toBe("stale_1d")
    expect(classifyDrawFreshness(73 * 60)).toBe("stale_3d")
  })

  it("supports the longer weekly Brinco draw interval", () => {
    expect(classifyDrawFreshness(7 * 24 * 60, 8 * 24 * 60, 15 * 24 * 60)).toBe("fresh")
    expect(classifyDrawFreshness(9 * 24 * 60, 8 * 24 * 60, 15 * 24 * 60)).toBe("stale_1d")
    expect(classifyDrawFreshness(16 * 24 * 60, 8 * 24 * 60, 15 * 24 * 60)).toBe("stale_3d")
  })
})
