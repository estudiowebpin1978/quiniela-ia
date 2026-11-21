export interface TopKMetrics {
  hitAt1: boolean
  hitAt5: boolean
  hitAt10: boolean
  hitsTop10: string[]
}

export function evaluateTopK(
  predicted: readonly string[],
  actual: readonly string[],
): TopKMetrics {
  const actualSet = new Set(actual)
  const hitsTop10 = predicted.slice(0, 10).filter((number) => actualSet.has(number))

  return {
    hitAt1: predicted.length > 0 && actualSet.has(predicted[0]),
    hitAt5: predicted.slice(0, 5).some((number) => actualSet.has(number)),
    hitAt10: hitsTop10.length > 0,
    hitsTop10,
  }
}
