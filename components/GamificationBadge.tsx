"use client"
import { useState, useEffect } from "react"
import { isLoggedIn, getAccessToken } from "@/lib/auth"
import { xpForNextLevel, xpForCurrentLevel, ACHIEVEMENTS } from "@/lib/gamification"

interface Props {
  compact?: boolean
}

export default function GamificationBadge({ compact = false }: Props) {
  const [data, setData] = useState<any>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [newAchievement, setNewAchievement] = useState<any>(null)

  useEffect(() => {
    if (!isLoggedIn()) return
    const token = getAccessToken()
    if (!token) return

    fetch("/api/gamification", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  if (!data || !isLoggedIn()) return null

  const level = data.level || 1
  const xp = data.xp || 0
  const streak = data.streak || 0
  const xpCurrent = xpForCurrentLevel(level)
  const xpNext = xpForNextLevel(level)
  const xpProgress = xpNext > xpCurrent ? ((xp - xpCurrent) / (xpNext - xpCurrent)) * 100 : 100

  if (compact) {
    return (
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12, padding: "6px 12px", cursor: "pointer",
      }} onClick={() => setShowDetails(!showDetails)}>
        <span style={{ fontSize: 16 }}>🏅</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#a855f7" }}>Nv.{level}</span>
        {streak > 0 && <>
          <span style={{ fontSize: 11, color: "#475569" }}>|</span>
          <span style={{ fontSize: 13 }}>🔥 {streak}</span>
        </>}
      </div>
    )
  }

  return (
    <>
      <div style={{
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16, padding: "16px 14px", cursor: "pointer",
      }} onClick={() => setShowDetails(!showDetails)}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: "linear-gradient(135deg,#a855f7,#7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 900, color: "#fff",
          }}>
            {level}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>Nivel {level}</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{xp} XP total</div>
          </div>
          {streak > 0 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 18 }}>🔥</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#f97316" }}>{streak} días</div>
            </div>
          )}
        </div>
        {/* XP bar */}
        <div style={{
          height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", width: `${Math.min(100, xpProgress)}%`,
            background: "linear-gradient(90deg,#a855f7,#7c3aed)", borderRadius: 3,
            transition: "width 0.5s ease",
          }} />
        </div>
        <div style={{ fontSize: 10, color: "#64748b", marginTop: 4, textAlign: "right" }}>
          {xp - xpCurrent} / {xpNext - xpCurrent} XP para nivel {level + 1}
        </div>
      </div>

      {/* Detail modal */}
      {showDetails && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
          zIndex: 99998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={() => setShowDetails(false)}>
          <div style={{
            background: "linear-gradient(180deg,rgba(20,20,40,0.98),rgba(10,10,25,1))",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20,
            padding: 24, maxWidth: 360, width: "100%", maxHeight: "80vh", overflow: "auto",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>Tu Progreso</h3>
              <button onClick={() => setShowDetails(false)} style={{
                background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8,
                width: 32, height: 32, color: "#94a3b8", cursor: "pointer", fontSize: 16,
              }}>✕</button>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[
                { label: "Nivel", value: level, icon: "🏅" },
                { label: "Racha", value: `${streak}d`, icon: "🔥" },
                { label: "XP", value: xp, icon: "⭐" },
              ].map((s, i) => (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12, padding: "10px 8px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 20 }}>{s.icon}</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Achievements */}
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 10 }}>Logros</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ACHIEVEMENTS.map(ach => {
                const unlocked = (data.achievements || []).some((a: any) => a.id === ach.id)
                return (
                  <div key={ach.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 10px", borderRadius: 10,
                    background: unlocked ? "rgba(168,85,247,0.08)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${unlocked ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.04)"}`,
                    opacity: unlocked ? 1 : 0.4,
                  }}>
                    <span style={{ fontSize: 20 }}>{ach.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: unlocked ? "#e2e8f0" : "#64748b" }}>{ach.name}</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>{ach.desc}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: unlocked ? "#a855f7" : "#475569" }}>+{ach.xp} XP</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* New achievement toast */}
      {newAchievement && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 99999,
          background: "linear-gradient(135deg,#a855f7,#7c3aed)",
          border: "1px solid rgba(168,85,247,0.5)", borderRadius: 16,
          padding: "12px 16px", maxWidth: 280,
          boxShadow: "0 8px 32px rgba(168,85,247,0.4)",
          animation: "slideIn 0.3s ease",
        }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>¡Logro desbloqueado!</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 24 }}>{newAchievement.icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{newAchievement.name}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>+{newAchievement.xp} XP</div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </>
  )
}
