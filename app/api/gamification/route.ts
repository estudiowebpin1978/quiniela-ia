import { NextRequest, NextResponse } from "next/server"
import { calcLevel, calcStreak, checkAchievements, XP_REWARDS, ACHIEVEMENTS } from "@/lib/gamification"

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!

async function verifyUser(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return null
  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { "apikey": SB_KEY, "Authorization": `Bearer ${token}` },
  })
  if (!res.ok) return null
  return (await res.json()).id as string
}

async function getGamification(userId: string) {
  const res = await fetch(
    `${SB_URL}/rest/v1/user_gamification?user_id=eq.${userId}&limit=1`,
    { headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` } }
  )
  if (!res.ok) return null
  const rows = await res.json()
  return rows?.[0] || null
}

async function getAchievements(userId: string) {
  const res = await fetch(
    `${SB_URL}/rest/v1/user_achievements?user_id=eq.${userId}&select=achievement_id,unlocked_at`,
    { headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` } }
  )
  if (!res.ok) return []
  return await res.json()
}

async function getTurnosUsed(userId: string) {
  const res = await fetch(
    `${SB_URL}/rest/v1/user_predictions?user_id=eq.${userId}&select=turno`,
    { headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` } }
  )
  if (!res.ok) return new Set<string>()
  const rows = await res.json()
  return new Set<string>(rows.map((r: any) => r.turno?.replace(/\d+cifras$/, "").toLowerCase()).filter(Boolean))
}

async function upsertGamification(userId: string, data: any) {
  await fetch(`${SB_URL}/rest/v1/user_gamification`, {
    method: "POST",
    headers: {
      "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`,
      "Content-Type": "application/json", Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ user_id: userId, ...data, updated_at: new Date().toISOString() }),
  })
}

async function insertAchievement(userId: string, achievementId: string) {
  await fetch(`${SB_URL}/rest/v1/user_achievements`, {
    method: "POST",
    headers: {
      "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`,
      "Content-Type": "application/json", Prefer: "return=minimal",
    },
    body: JSON.stringify({ user_id: userId, achievement_id: achievementId }),
  })
}

// GET: fetch gamification data
export async function GET(req: NextRequest) {
  const userId = await verifyUser(req)
  if (!userId) return NextResponse.json({ xp: 0, level: 1, streak: 0, achievements: [], newAchievements: [] })

  const gam = await getGamification(userId)
  const achRows = await getAchievements(userId)
  const unlockedIds = new Set<string>(achRows.map((a: any) => a.achievement_id))
  const turnosUsed = await getTurnosUsed(userId)

  const xp = gam?.xp || 0
  const level = gam?.level || 1
  const streak = gam?.streak || 0

  const achievements = ACHIEVEMENTS
    .filter(a => unlockedIds.has(a.id))
    .map(a => ({
      id: a.id,
      name: a.name,
      icon: a.icon,
      desc: a.desc,
      unlocked_at: achRows.find((r: any) => r.achievement_id === a.id)?.unlocked_at || "",
    }))

  return NextResponse.json({
    xp,
    level,
    streak,
    last_active_date: gam?.last_active_date || null,
    total_analyses: gam?.total_analyses || 0,
    total_saves: gam?.total_saves || 0,
    total_compares: gam?.total_compares || 0,
    achievements,
    newAchievements: [],
    turnosUsed: Array.from(turnosUsed),
  })
}

// POST: record activity and check achievements
export async function POST(req: NextRequest) {
  const userId = await verifyUser(req)
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const action = body.action as "analysis" | "save" | "compare" | "premium"
  const turno = body.turno as string | undefined

  // Get current state
  let gam = await getGamification(userId)
  const today = new Date().toISOString().split("T")[0]

  if (!gam) {
    // First time — create
    gam = { xp: 0, level: 1, streak: 0, last_active_date: null, total_analyses: 0, total_saves: 0, total_compares: 0 }
  }

  // Calculate streak
  const { streak: newStreak, isNewDay } = calcStreak(gam.streak, gam.last_active_date)

  // Calculate XP
  let xpGain = 0
  if (action === "analysis") xpGain = XP_REWARDS.analysis
  else if (action === "save") xpGain = XP_REWARDS.save
  else if (action === "compare") xpGain = XP_REWARDS.compare
  else if (action === "premium") xpGain = 150

  if (isNewDay && gam.last_active_date) xpGain += XP_REWARDS.streak_bonus

  const newXP = gam.xp + xpGain
  const newLevel = calcLevel(newXP)

  // Update counters
  const updates: any = {
    xp: newXP,
    level: newLevel,
    streak: newStreak,
    last_active_date: today,
  }
  if (action === "analysis") updates.total_analyses = (gam.total_analyses || 0) + 1
  if (action === "save") updates.total_saves = (gam.total_saves || 0) + 1
  if (action === "compare") updates.total_compares = (gam.total_compares || 0) + 1

  await upsertGamification(userId, updates)

  // Check achievements
  const turnosUsed = await getTurnosUsed(userId)
  if (turno) turnosUsed.add(turno.toLowerCase().replace(/\d+cifras$/, ""))

  const achRows = await getAchievements(userId)
  const unlockedIds = new Set<string>(achRows.map((a: any) => a.achievement_id))

  const gamData = {
    ...gam,
    ...updates,
    streak: newStreak,
    total_analyses: updates.total_analyses || gam.total_analyses,
    total_saves: updates.total_saves || gam.total_saves,
    total_compares: updates.total_compares || gam.total_compares,
    achievements: [],
    newAchievements: [],
  }

  const newUnlocks = checkAchievements(gamData, unlockedIds, turnosUsed)

  // Handle premium achievement
  if (action === "premium" && !unlockedIds.has("premium_user")) {
    newUnlocks.push({ id: "premium_user", xp: 150 })
  }

  for (const unlock of newUnlocks) {
    await insertAchievement(userId, unlock.id)
  }

  const newAchievementDetails = newUnlocks.map(u => {
    const ach = ACHIEVEMENTS.find(a => a.id === u.id)!
    return { id: ach.id, name: ach.name, icon: ach.icon, desc: ach.desc, xp: ach.xp }
  })

  return NextResponse.json({
    xp: newXP,
    level: newLevel,
    streak: newStreak,
    xpGain,
    newAchievements: newAchievementDetails,
  })
}
