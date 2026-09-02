"use client"
import { useState, useEffect, useCallback } from "react"
import { isLoggedIn, getAccessToken } from "@/lib/auth"
import { xpForNextLevel, xpForCurrentLevel } from "@/lib/gamification"

interface StreakData {
  level: number
  xp: number
  streak: number
  bestStreak: number
  totalAnalyses: number
}

export default function StreakBar() {
  const [data, setData] = useState<StreakData | null>(null)

  const fetchData = useCallback(async () => {
    if (!isLoggedIn()) return
    const token = getAccessToken()
    if (!token) return
    try {
      const res = await fetch("/api/gamification", { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const d = await res.json()
      setData({
        level: d.level || 1,
        xp: d.xp || 0,
        streak: d.streak || 0,
        bestStreak: d.bestStreak || 0,
        totalAnalyses: d.totalAnalyses || 0,
      })
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => {
    fetchData()
    const handler = () => fetchData()
    window.addEventListener("gamification-update", handler)
    return () => window.removeEventListener("gamification-update", handler)
  }, [fetchData])

  if (!data || !isLoggedIn()) return null

  const level = data.level
  const xpCurrent = xpForCurrentLevel(level)
  const xpNext = xpForNextLevel(level)
  const xpProgress = xpNext > xpCurrent ? Math.min(((data.xp - xpCurrent) / (xpNext - xpCurrent)) * 100, 100) : 100

  const streakMessage = data.streak === 0
    ? "Activá tu racha hoy"
    : data.streak < 3
      ? "¡Seguí así!"
        : data.streak < 7
          ? "¡Racha fueeeeerte!"
          : data.streak < 30
            ? "¡Leyenda viviente!"
            : "¡Imparable! 🔥"

  return (
    <div style={{
      margin: "0 12px 8px", padding: "10px 16px",
      background: "rgba(255,255,255,0.03)", borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.06)",
      display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
    }}>
      {/* Streak flame */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 22 }}>🔥</span>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: data.streak > 0 ? "#ff6b35" : "#64748b", lineHeight: 1 }}>
            {data.streak}
          </div>
          <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            días seguidos
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)" }} />

      {/* Level + XP */}
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#a855f7" }}>Nv.{level}</span>
          <span style={{ fontSize: 10, color: "#94a3b8" }}>{data.xp} / {xpNext} XP</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: "rgba(168,85,247,.15)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 3,
            background: "linear-gradient(90deg, #a855f7, #7c3aed)",
            width: `${xpProgress}%`, transition: "width .5s ease",
          }} />
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)" }} />

      {/* Motivational message */}
      <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic", textAlign: "right" }}>
        {streakMessage}
      </div>
    </div>
  )
}
