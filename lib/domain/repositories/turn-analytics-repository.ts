/**
 * Repository Interface: TurnAnalytics
 */
import type { TurnAnalytics } from "../entities/turn-analytics"

export interface TurnAnalyticsRepository {
  findLatest(gameId: string, turno: string): Promise<TurnAnalytics | null>
  upsert(analytics: TurnAnalytics): Promise<void>
  computeAll(gameSlug: string): Promise<void>
}
