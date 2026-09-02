/**
 * /api/cron-emails
 *
 * Automated email cron job. Runs daily via Vercel Cron or cron-job.org.
 * Sends: weekly digest (Mondays), re-engagement (7 days inactive), premium expiry reminders.
 *
 * Auth: CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth"
import {
  sendWeeklyDigest,
  sendReengagementEmail,
  sendPremiumExpiryEmail,
} from "@/lib/email"
import logger from "@/lib/logger"

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const supabase = getSupabaseAdmin()
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Sun, 1=Mon, ...
  const results: string[] = []

  // ── 1. Weekly digest (Mondays) ──────────────────────────────────────
  if (dayOfWeek === 1) {
    try {
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

      const { data: activeUsers } = await supabase
        .from("user_profiles")
        .select("user_id, email, display_name")
        .not("email", "is", null)
        .limit(500)

      if (activeUsers && activeUsers.length > 0) {
        let sent = 0
        for (const user of activeUsers) {
          if (!user.email) continue

          // Get user's stats for the week
          const { data: history } = await supabase
            .from("prediction_history")
            .select("total_aciertos, turno")
            .eq("user_id", user.user_id)
            .gte("date", weekAgo)

          if (!history || history.length === 0) continue

          const totalHits = history.reduce((sum, h) => sum + (h.total_aciertos || 0), 0)
          const totalPredictions = history.length

          // Get gamification data
          const { data: gamification } = await supabase
            .from("user_gamification")
            .select("level, streak")
            .eq("user_id", user.user_id)
            .single()

          // Find best turno
          const turnoCounts: Record<string, { preds: number; hits: number }> = {}
          for (const h of history) {
            const t = h.turno || "unknown"
            if (!turnoCounts[t]) turnoCounts[t] = { preds: 0, hits: 0 }
            turnoCounts[t].preds++
            turnoCounts[t].hits += h.total_aciertos || 0
          }
          const bestTurno = Object.entries(turnoCounts)
            .sort(([, a], [, b]) => b.hits - a.hits)[0]?.[0] || "Primera"

          const { ok } = await sendWeeklyDigest(user.email, user.display_name || "", {
            totalHits,
            totalPredictions,
            bestTurno,
            streak: gamification?.streak || 0,
            level: gamification?.level || 1,
          })
          if (ok) sent++
        }
        results.push(`weekly_digest: ${sent} sent`)
      }
    } catch (e) {
      logger.error("[cron-emails] Weekly digest failed", { error: String(e) })
      results.push(`weekly_digest: error - ${String(e)}`)
    }
  }

  // ── 2. Re-engagement (users inactive > 7 days) ─────────────────────
  try {
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const fourteenDaysAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()

    // Find users who were active 8-14 days ago but not since
    const { data: lapsedUsers } = await supabase
      .from("user_gamification")
      .select("user_id, streak, last_active_date")
      .lt("last_active_date", sevenDaysAgo)
      .gte("last_active_date", fourteenDaysAgo)

    if (lapsedUsers && lapsedUsers.length > 0) {
      let sent = 0
      for (const user of lapsedUsers) {
        // Get email from profile
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("email, display_name")
          .eq("user_id", user.user_id)
          .single()

        if (!profile?.email) continue

        // Get best turno
        const { data: history } = await supabase
          .from("prediction_history")
          .select("turno, total_aciertos")
          .eq("user_id", user.user_id)
          .order("created_at", { ascending: false })
          .limit(30)

        const turnoCounts: Record<string, number> = {}
        for (const h of history || []) {
          const t = h.turno || "unknown"
          turnoCounts[t] = (turnoCounts[t] || 0) + (h.total_aciertos || 0)
        }
        const bestTurno = Object.entries(turnoCounts)
          .sort(([, a], [, b]) => b - a)[0]?.[0] || "Primera"

        const daysInactive = Math.floor((today.getTime() - new Date(user.last_active_date || sevenDaysAgo).getTime()) / (24 * 60 * 60 * 1000))

        const { ok } = await sendReengagementEmail(profile.email, profile.display_name || "", {
          daysInactive,
          streak: user.streak || 0,
          bestTurno,
        })
        if (ok) sent++
      }
      results.push(`reengagement: ${sent} sent`)
    }
  } catch (e) {
    logger.error("[cron-emails] Re-engagement failed", { error: String(e) })
    results.push(`reengagement: error - ${String(e)}`)
  }

  // ── 3. Premium expiry reminders (3 days before) ────────────────────
  try {
    const in3Days = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    const todayStr = today.toISOString().split("T")[0]

    const { data: expiringPremium } = await supabase
      .from("user_profiles")
      .select("user_id, email, display_name, premium_until")
      .eq("role", "premium")
      .lte("premium_until", in3Days)
      .gte("premium_until", todayStr)
      .not("email", "is", null)

    if (expiringPremium && expiringPremium.length > 0) {
      let sent = 0
      for (const user of expiringPremium) {
        if (!user.email || !user.premium_until) continue
        const daysLeft = Math.ceil((new Date(user.premium_until).getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
        if (daysLeft <= 0) continue

        const { ok } = await sendPremiumExpiryEmail(user.email, user.display_name || "", { daysLeft })
        if (ok) sent++
      }
      results.push(`premium_expiry: ${sent} sent`)
    }
  } catch (e) {
    logger.error("[cron-emails] Premium expiry failed", { error: String(e) })
    results.push(`premium_expiry: error - ${String(e)}`)
  }

  logger.info("[cron-emails] Completed", { results })
  return NextResponse.json({ ok: true, results })
}
