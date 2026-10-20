"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowser } from "@/lib/supabase-browser"

// Extend Window for one-time keyframe injection flags
declare global {
  interface Window {
    __rv_slide_down_injected?: boolean;
  }
}

interface PredictionVerification {
  id: string
  date: string
  turno: string
  status: "WON" | "LOST"
  numeros: Record<string, string[]> | string
  aciertos: number[] | string
  verified_at: string | null
}

interface RealtimeVerificationProps {
  userId: string
  onVerified?: (pred: PredictionVerification) => void
}

/**
 * Subscribes to user_predictions updates via WebSocket.
 * When the cron auto-verifies predictions, the UI shows
 * "¡Acierto verificado!" or "No acertaste" instantly.
 */
export function RealtimeVerification({ userId, onVerified }: RealtimeVerificationProps) {
  const [notification, setNotification] = useState<PredictionVerification | null>(null)
  const [connected, setConnected] = useState(false)

  const handleVerification = useCallback((pred: PredictionVerification) => {
    setNotification(pred)
    onVerified?.(pred)
    setTimeout(() => setNotification(null), 10000)
  }, [onVerified])

  useEffect(() => {
    if (!userId) return

    const supabase = getSupabaseBrowser()
    if (!supabase) return

    const channel = supabase
      .channel(`user-predictions:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_predictions",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const pred = payload.new as PredictionVerification
          if (pred && (pred.status === "WON" || pred.status === "LOST")) {
            handleVerification(pred)
          }
        }
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED")
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, handleVerification])

  // Inject animation keyframes once (must be before any early return)
  useEffect(() => {
    if (typeof window !== "undefined" && !window.__rv_slide_down_injected) {
      const style = document.createElement("style")
      style.textContent = `
        @keyframes rv-slide-down {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .rv-toast { animation: rv-slide-down 0.4s cubic-bezier(0.34,1.56,0.64,1); }
      `
      document.head.appendChild(style)
      window.__rv_slide_down_injected = true
    }
  }, [])

  if (!notification) {
    return (
      <span
        style={{
          position: "fixed", bottom: 12, left: 12, zIndex: 40,
          display: "inline-flex", alignItems: "center", gap: 6,
          borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap",
          fontSize: 10, fontWeight: 700, letterSpacing: ".3px",
          border: `1px solid ${connected ? "rgba(52,211,153,.35)" : "rgba(255,255,255,.14)"}`,
          background: connected ? "rgba(16,185,129,.12)" : "rgba(255,255,255,.05)",
          color: connected ? "#34d399" : "#94a3b8",
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 999, flexShrink: 0, background: connected ? "#34d399" : "#94a3b8" }} />
        <span>{connected ? "Verificación en vivo" : "Sin conexión"}</span>
      </span>
    )
  }

  const isWin = notification.status === "WON"

  // Parse aciertos
  let aciertosStr = ""
  if (Array.isArray(notification.aciertos)) {
    aciertosStr = notification.aciertos.join(", ")
  } else if (typeof notification.aciertos === "string") {
    aciertosStr = notification.aciertos
  }

  return (
    <div className="rv-toast" style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 50,
      maxWidth: "360px", pointerEvents: "auto"
    }}>
      <div style={{
        background: isWin
          ? "linear-gradient(135deg, #fbbf24, #f59e0b)"
          : "linear-gradient(135deg, #4b5563, #374151)",
        border: `1px solid ${isWin ? "rgba(251,191,36,0.3)" : "rgba(107,114,128,0.3)"}`,
        borderRadius: "16px",
        padding: "16px 24px",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.05)",
        display: "flex", alignItems: "center", gap: 16, maxWidth: "360px",
      }}>
        <span style={{ fontSize: "48px", lineHeight: 1 }}>{isWin ? "🎉" : "😢"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: "14px", margin: "0 0 4px", color: "#fff" }}>
            {isWin ? "¡Acierto verificado!" : "No acertaste esta vez"}
          </p>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", margin: 0 }}>
            {notification.turno} · {notification.date}
          </p>
          {isWin && aciertosStr && (
            <p style={{ fontSize: "11px", color: "#fde68a", margin: "4px 0 0" }}>
              Aciertos: {aciertosStr}
            </p>
          )}
        </div>
        <button
          onClick={() => setNotification(null)}
          style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.6)",
            fontSize: "24px", lineHeight: 1, cursor: "pointer", padding: 0,
            fontWeight: 700, transition: "color 0.1s"
          }}
          onMouseEnter={e => e.currentTarget.style.color = "#fff"}
          onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.6)"}
        >
          ×
        </button>
      </div>
    </div>
  )
}
