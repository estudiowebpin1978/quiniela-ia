/**
 * Application Use Case: ScrapeAndStore
 * Orchestrates scraping lottery results and storing them
 */
import { SupabaseDrawRepository } from "@/lib/infrastructure/supabase/draw-repository"
import { SupabaseGameRepository } from "@/lib/infrastructure/supabase/game-repository"
import { Draw } from "@/lib/domain/entities/draw"

export interface ScrapeAndStoreInput {
  gameSlug: string
  source: string
  htmlContent?: string
}

export interface ScrapeAndStoreOutput {
  ok: boolean
  stored: number
  errors: string[]
}

export async function scrapeAndStore(input: ScrapeAndStoreInput): Promise<ScrapeAndStoreOutput> {
  const gameRepo = new SupabaseGameRepository()
  const drawRepo = new SupabaseDrawRepository()

  const game = await gameRepo.findBySlug(input.gameSlug)
  if (!game) {
    return { ok: false, stored: 0, errors: [`Game not found: ${input.gameSlug}`] }
  }

  // The actual scraping logic is in lib/scrapers/orchestrator.ts
  // This use case just handles the storage part
  const errors: string[] = []
  let stored = 0

  try {
    // Import scraper dynamically to avoid circular deps
    const { scrapeAll } = await import("@/lib/scrapers/orchestrator")
    const results = await scrapeAll()

    const draws: Draw[] = results.map((r: any) =>
      Draw.create({
        id: 0,
        gameId: game.id,
        date: r.date,
        turno: r.turno,
        numbers: r.numbers,
        source: r.source,
        htmlHash: r.htmlHash ?? null,
        confidenceScore: r.confidence ?? null,
        sourcePriority: r.sourcePriority ?? 0,
      })
    )

    if (draws.length > 0) {
      stored = await drawRepo.upsertMany(draws)
    }
  } catch (err: any) {
    errors.push(err.message || "Unknown scraping error")
  }

  return { ok: errors.length === 0, stored, errors }
}
