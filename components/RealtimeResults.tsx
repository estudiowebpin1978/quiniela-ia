"use client"

import { useEffect, useState, useCallback } from "react"
import { getSupabaseBrowser } from "@/lib/supabase-browser"

interface NewDrawEvent {
  date: string
  turno: string
  numbers: number[]
  jurisdiccion: string
}

interface RealtimeResultsProps {
  /** Current date being viewed (YYYY-MM-DD) */
  currentDate?: string
  /** Callback when a new draw is detected */
  onNewDraw?: (draw: NewDrawEvent) => void
}

/**
 * Supabase Realtime subscription for draws table.
 * Shows a toast notification when a new draw is inserted.
 *
 * Usage:
 *   <RealtimeResults onNewDraw={(draw) => refreshPage()} />
 */
export function RealtimeResults({ currentDate, onNewDraw }: RealtimeResultsProps) {
  const [notification, setNotification] = useState<NewDrawEvent | null>(null)
  const [isSubscribed, setIsSubscribed] = useState(false)

  const handleNewDraw = useCallback((payload: NewDrawEvent) => {
    setNotification(payload)
    onNewDraw?.(payload)

    // Auto-dismiss after 8 seconds
    setTimeout(() => setNotification(null), 8000)
  }, [onNewDraw])

  useEffect(() => {
    const supabase = getSupabaseBrowser()

    const channel = supabase
      .channel("draws-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "draws",
        },
        (payload) => {
          const draw = payload.new as NewDrawEvent
          if (draw && draw.date && draw.turno && Array.isArray(draw.numbers)) {
            handleNewDraw(draw)
          }
        }
      )
      .subscribe((status) => {
        setIsSubscribed(status === "SUBSCRIBED")
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [handleNewDraw])

  if (!notification) return null

  const nums = notification.numbers.slice(0, 5).join(", ")
  const turnoEmoji: Record<string, string> = {
    Previa: "🌅",
    Primera: "☀️",
    Matutina: "🌤️",
    Vespertina: "🌇",
    Nocturna: "🌙",
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-3 rounded-xl shadow-2xl border border-green-400/30 flex items-center gap-3 max-w-md">
        <span className="text-2xl">{turnoEmoji[notification.turno] || "🎱"}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">
            ¡Ya salió la {notification.turno}!
          </p>
          <p className="text-green-100 text-xs truncate">
            Cabeza: {notification.numbers[0]?.toString().padStart(2, "0")} | Top 5: {nums}
          </p>
        </div>
        <button
          onClick={() => setNotification(null)}
          className="text-green-200 hover:text-white text-lg font-bold"
        >
          ×
        </button>
      </div>
    </div>
  )
}

/**
 * Compact badge for use in prediction pages.
 * Shows connection status and new draw alerts.
 */
export function RealtimeBadge() {
  const [connected, setConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowser()

    const channel = supabase
      .channel("draws-status")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "draws" },
        () => {
          setLastUpdate(new Date().toLocaleTimeString("es-AR"))
        }
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED")
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <span
        className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-gray-500"}`}
      />
      <span>{connected ? "En vivo" : "Desconectado"}</span>
      {lastUpdate && <span className="text-gray-500">· {lastUpdate}</span>}
    </div>
  )
}
