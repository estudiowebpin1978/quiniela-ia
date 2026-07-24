/**
 * Repository Interface: Game
 */
import type { Game } from "../entities/game"

export interface GameRepository {
  findBySlug(slug: string): Promise<Game | null>
  findActiveGames(): Promise<Game[]>
  findAll(): Promise<Game[]>
}
