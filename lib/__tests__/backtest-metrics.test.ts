import { describe, expect, it } from "vitest"
import { evaluateTopK } from "@/lib/backtest/metrics"

describe("evaluateTopK", () => {
  it("measures each cutoff against the actual draw", () => {
    const predicted = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]
    const actual = ["06", "20", "30"]

    expect(evaluateTopK(predicted, actual)).toEqual({
      hitAt1: false,
      hitAt5: false,
      hitAt10: true,
      hitsTop10: ["06"],
    })
  })

  it("does not count another ranked prediction as a top-1 hit", () => {
    const metrics = evaluateTopK(["07", "12", "19", "23", "35", "44"], ["44", "01"])

    expect(metrics.hitAt1).toBe(false)
    expect(metrics.hitAt5).toBe(false)
    expect(metrics.hitAt10).toBe(true)
  })

  it("reports no hits for an empty prediction list", () => {
    expect(evaluateTopK([], ["01", "02"])).toEqual({
      hitAt1: false,
      hitAt5: false,
      hitAt10: false,
      hitsTop10: [],
    })
  })
})
