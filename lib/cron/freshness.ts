export type DrawFreshnessStatus = "fresh" | "stale_1d" | "stale_3d"

export function classifyDrawFreshness(ageMinutes: number): DrawFreshnessStatus {
  if (ageMinutes > 72 * 60) return "stale_3d"
  if (ageMinutes > 30 * 60) return "stale_1d"
  return "fresh"
}
