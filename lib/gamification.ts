/**
 * Gamification system — XP, levels, streaks, achievements.
 * All logic is pure functions, no side effects.
 */

export const ACHIEVEMENTS = [
  { id: "first_analysis", name: "Primer Análisis", icon: "🎯", desc: "Completá tu primer análisis", xp: 50 },
  { id: "streak_3", name: "Racha de 3", icon: "🔥", desc: "3 días consecutivos analizando", xp: 100 },
  { id: "streak_7", name: "Semana Perfecta", icon: "🔥", desc: "7 días consecutivos analizando", xp: 300 },
  { id: "streak_30", name: "Mes Completo", icon: "🏆", desc: "30 días consecutivos analizando", xp: 1000 },
  { id: "level_5", name: "Estadístico", icon: "⭐", desc: "Alcanzá nivel 5", xp: 150 },
  { id: "level_10", name: "Maestro de Datos", icon: "🧠", desc: "Alcanzá nivel 10", xp: 500 },
  { id: "level_25", name: "Leyenda", icon: "👑", desc: "Alcanzá nivel 25", xp: 2000 },
  { id: "10_analyses", name: "Analista", icon: "📊", desc: "10 análisis guardados", xp: 75 },
  { id: "50_analyses", name: "Investigador", icon: "🔬", desc: "50 análisis guardados", xp: 200 },
  { id: "100_analyses", name: "Científico", icon: "🎓", desc: "100 análisis guardados", xp: 500 },
  { id: "all_turnos", name: "Rotativo", icon: "🔄", desc: "Analizá los 5 turnos", xp: 200 },
  { id: "premium_user", name: "Premium", icon: "⭐", desc: "Activaste Premium", xp: 150 },
] as const

export type AchievementId = typeof ACHIEVEMENTS[number]["id"]

export interface GamificationData {
  xp: number
  level: number
  streak: number
  last_active_date: string | null
  total_analyses: number
  total_saves: number
  total_compares: number
  achievements: { id: string; name: string; icon: string; desc: string; unlocked_at: string }[]
  newAchievements: { id: string; name: string; icon: string; desc: string; xp: number }[]
}

/** Calculate level from XP: level = floor(sqrt(xp / 50)) */
export function calcLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 50))
}

/** XP needed for next level: (level+1)^2 * 50 */
export function xpForNextLevel(level: number): number {
  return (level + 1) * (level + 1) * 50
}

/** XP needed for current level: level^2 * 50 */
export function xpForCurrentLevel(level: number): number {
  return level * level * 50
}

/** Calculate streak from last_active_date */
export function calcStreak(currentStreak: number, lastActiveDate: string | null): { streak: number; isNewDay: boolean } {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })
  if (!lastActiveDate) return { streak: 1, isNewDay: true }
  if (lastActiveDate === today) return { streak: currentStreak, isNewDay: false }

  const last = new Date(lastActiveDate + "T12:00:00Z")
  const now = new Date(today + "T12:00:00Z")
  const diffDays = Math.floor((now.getTime() - last.getTime()) / 86400000)

  if (diffDays === 1) return { streak: currentStreak + 1, isNewDay: true }
  if (diffDays > 1) return { streak: 1, isNewDay: true }
  return { streak: currentStreak, isNewDay: false }
}

/** Check which achievements should be unlocked */
export function checkAchievements(
  data: GamificationData,
  unlockedIds: Set<string>,
  turnosUsed: Set<string> = new Set(),
  isPremium: boolean = false
): { id: AchievementId; xp: number }[] {
  const newUnlocks: { id: AchievementId; xp: number }[] = []
  const checks: [AchievementId, boolean][] = [
    ["first_analysis", data.total_analyses >= 1],
    ["streak_3", data.streak >= 3],
    ["streak_7", data.streak >= 7],
    ["streak_30", data.streak >= 30],
    ["level_5", data.level >= 5],
    ["level_10", data.level >= 10],
    ["level_25", data.level >= 25],
    ["10_analyses", data.total_analyses >= 10],
    ["50_analyses", data.total_analyses >= 50],
    ["100_analyses", data.total_analyses >= 100],
    ["all_turnos", turnosUsed.size >= 5],
    ["premium_user", isPremium],
  ]

  for (const [id, condition] of checks) {
    if (condition && !unlockedIds.has(id)) {
      const ach = ACHIEVEMENTS.find(a => a.id === id)!
      newUnlocks.push({ id, xp: ach.xp })
    }
  }

  return newUnlocks
}

/** XP rewards */
export const XP_REWARDS = {
  analysis: 10,
  save: 5,
  compare: 5,
  streak_bonus: 5,
} as const
