/**
 * Repository Interface: Draw
 */
import type { Draw } from "../entities/draw"

export interface DrawRepository {
  findRecent(gameId: string, turno: string, limit: number): Promise<Draw[]>
  findBetweenDates(gameId: string, turno: string, from: string, to: string): Promise<Draw[]>
  findLatest(gameId: string, turno: string): Promise<Draw | null>
  upsertMany(draws: Draw[]): Promise<number>
  countByGame(gameId: string): Promise<number>
}
