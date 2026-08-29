/**
 * Multi-game support for Quiniela IA.
 * Provides functions to manage games and validate game-specific parameters.
 */

const SB_URL = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

export interface Game {
  id: string
  slug: string
  name: string
  description?: string
  number_count: number
  number_range_min: number
  number_range_max: number
  turns: string[]
  is_active: boolean
}

// In-memory cache for games
const gamesCache = new Map<string, Game>()
let lastFetch = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Fetch all active games from Supabase.
 */
export async function fetchGames(): Promise<Game[]> {
  const SB = SB_URL()
  const SK = SB_KEY()
  if (!SB || !SK) return []

  try {
    const res = await fetch(
      `${SB}/rest/v1/games?is_active=eq.true&select=*`,
      { 
        headers: { apikey: SK, Authorization: `Bearer ${SK}` },
        signal: AbortSignal.timeout(5000)
      }
    )
    if (!res.ok) return []
    const games = await res.json()
    
    // Cache each game
    for (const game of games) {
      gamesCache.set(game.slug, game)
    }
    lastFetch = Date.now()
    
    return games
  } catch {
    return []
  }
}

/**
 * Get a game by slug (cached).
 */
export async function getGame(slug: string): Promise<Game | null> {
  // Check cache first
  if (gamesCache.has(slug) && Date.now() - lastFetch < CACHE_TTL) {
    return gamesCache.get(slug)!
  }
  
  // Fetch from DB
  await fetchGames()
  return gamesCache.get(slug) || null
}

/**
 * Get the default game (quiniela).
 */
export async function getDefaultGame(): Promise<Game | null> {
  return getGame('quiniela')
}

/**
 * Validate numbers for a specific game.
 */
export function validateNumbersForGame(
  game: Game,
  numbers: number[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (numbers.length !== game.number_count) {
    errors.push(`Expected ${game.number_count} numbers, got ${numbers.length}`)
  }
  
  for (const num of numbers) {
    if (num < game.number_range_min || num > game.number_range_max) {
      errors.push(`Number ${num} out of range [${game.number_range_min}-${game.number_range_max}]`)
    }
  }
  
  return { valid: errors.length === 0, errors }
}

/**
 * Check if a turno is valid for a specific game.
 */
export function isValidTurno(game: Game, turno: string): boolean {
  return game.turns.some(t => t.toLowerCase() === turno.toLowerCase())
}

/**
 * Get all valid turnos for a game.
 */
export function getTurnosForGame(game: Game): string[] {
  return game.turns
}

/**
 * Convert turno name to URL-safe format.
 */
export function turnoToSlug(turno: string): string {
  return turno.toLowerCase().replace(/\s+/g, '-')
}

/**
 * Get game ID by slug (synchronous, from cache).
 */
export function getGameIdFromCache(slug: string): string | null {
  return gamesCache.get(slug)?.id || null
}
