"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowser } from "@/lib/supabase-browser"

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

  if (!notification) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-gray-500"}`} />
        <span>{connected ? "Verificación en vivo" : "Sin conexión"}</span>
      </div>
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
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
      <div
        className={`text-white px-6 py-4 rounded-xl shadow-2xl border flex items-center gap-4 max-w-sm ${
          isWin
            ? "bg-gradient-to-r from-yellow-500 to-amber-600 border-yellow-400/30"
            : "bg-gradient-to-r from-gray-600 to-gray-700 border-gray-500/30"
        }`}
      >
        <span className="text-3xl">{isWin ? "🎉" : "😢"}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">
            {isWin ? "¡Acierto verificado!" : "No acertaste esta vez"}
          </p>
          <p className="text-white/80 text-xs">
            {notification.turno} · {notification.date}
          </p>
          {isWin && aciertosStr && (
            <p className="text-yellow-200 text-xs mt-1">
              Aciertos: {aciertosStr}
            </p>
          )}
        </div>
        <button
          onClick={() => setNotification(null)}
          className="text-white/60 hover:text-white text-lg font-bold"
        >
          ×
        </button>
      </div>
    </div>
  )
}
