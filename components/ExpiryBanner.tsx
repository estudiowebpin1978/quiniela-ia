"use client"
import { useState, useEffect } from "react"

const WA_CHANNEL = "https://whatsapp.com/channel/0029VbB7O9B9cDDUtBY9GU1F"

export default function ExpiryBanner({ premiumUntil }: { premiumUntil: string | null }) {
  const [dismissed, setDismissed] = useState(() => {
    if (!premiumUntil || typeof window === "undefined") return false
    return !!localStorage.getItem(`expiry-dismissed-${premiumUntil}`)
  })
  const [daysLeft, setDaysLeft] = useState<number | null>(() => {
    if (!premiumUntil) return null
    if (typeof window !== "undefined" && localStorage.getItem(`expiry-dismissed-${premiumUntil}`)) return null
    return Math.ceil((new Date(premiumUntil).getTime() - Date.now()) / 86400000)
  })

  useEffect(() => {
    if (!premiumUntil) return

    const timer = window.setTimeout(() => {
      const diff = Math.ceil((new Date(premiumUntil).getTime() - Date.now()) / 86400000)
      setDaysLeft(diff)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [premiumUntil])

  if (!premiumUntil || dismissed) return null

  if (daysLeft === null) return null

  if (daysLeft > 7) return null

  const isExpired = daysLeft <= 0
  const isUrgent = daysLeft <= 3

  const bg = isExpired
    ? "linear-gradient(135deg,rgba(239,68,68,.12),rgba(239,68,68,.06))"
    : isUrgent
    ? "linear-gradient(135deg,rgba(245,158,11,.12),rgba(245,158,11,.06))"
    : "linear-gradient(135deg,rgba(59,130,246,.12),rgba(59,130,246,.06))"

  const border = isExpired
    ? "1px solid rgba(239,68,68,.3)"
    : isUrgent
    ? "1px solid rgba(245,158,11,.3)"
    : "1px solid rgba(59,130,246,.3)"

  const textColor = isExpired ? "#fca5a5" : isUrgent ? "#fbbf24" : "#60a5fa"
  const icon = isExpired ? "🔴" : isUrgent ? "🟡" : "🔵"

  function handleDismiss() {
    setDismissed(true)
    localStorage.setItem(`expiry-dismissed-${premiumUntil}`, "true")
  }

  return (
    <div
      style={{
        background: bg,
        border: border,
        borderRadius: 14,
        padding: "14px 16px",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap"
      }}
    >
      <div style={{ fontSize: 24, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: textColor, marginBottom: 2 }}>
          {isExpired
            ? "Tu acceso Premium ha vencido"
            : daysLeft === 1
            ? "Tu Premium vence mañana"
            : `Tu Premium vence en ${daysLeft} días`}
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>
          {isExpired
            ? "Renová para seguir accediendo a análisis de 3 y 4 cifras."
            : "Renová antes del vencimiento para no perder el acceso."}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <a
          href={WA_CHANNEL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            background: "linear-gradient(135deg,#25D366,#128C7E)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            textDecoration: "none",
            boxShadow: "0 4px 12px rgba(37,211,102,.3)"
          }}
        >
          💬 Renovar
        </a>
        <button
          onClick={handleDismiss}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.1)",
            color: "#64748b",
            fontSize: 11,
            cursor: "pointer",
            fontFamily: "inherit"
          }}
        >
          Luego
        </button>
      </div>
    </div>
  )
}
