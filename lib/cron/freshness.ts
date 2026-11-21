export type DrawFreshnessStatus = "fresh" | "stale_1d" | "stale_3d"

export function classifyDrawFreshness(
  ageMinutes: number,
  staleAfterMinutes = 30 * 60,
  veryStaleAfterMinutes = 72 * 60,
): DrawFreshnessStatus {
  if (ageMinutes > veryStaleAfterMinutes) return "stale_3d"
  if (ageMinutes > staleAfterMinutes) return "stale_1d"
  return "fresh"
}
