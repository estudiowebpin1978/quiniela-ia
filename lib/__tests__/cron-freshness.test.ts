import { describe, expect, it } from "vitest"
import { classifyDrawFreshness } from "@/lib/cron/freshness"

describe("classifyDrawFreshness", () => {
  it("flags daily draws after the expected update window", () => {
    expect(classifyDrawFreshness(31 * 60)).toBe("stale_1d")
    expect(classifyDrawFreshness(73 * 60)).toBe("stale_3d")
    expect(classifyDrawFreshness(60)).toBe("fresh")
  })
})
