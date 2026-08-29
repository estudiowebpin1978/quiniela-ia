/**
 * Supabase Realtime hook for live prediction verification.
 *
 * Subscribes to user_predictions inserts and updates.
 * When the cron-triggered auto-verify runs, the frontend receives
 * a WebSocket event and can show "¡Acierto verificado!" instantly.
 */

"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@supabase/supabase-js"

export interface VerifiedPrediction {
  id: string
  date: string
  turno: string
  status: "PENDING" | "WON" | "LOST"
  numeros: Record<string, string[]> | string
  aciertos: number[] | string
  verified_at: string | null
}

interface UseRealtimePredictionOptions {
  userId: string
  enabled?: boolean
}

interface UseRealtimePredictionReturn {
  latestVerification: VerifiedPrediction | null
  isConnected: boolean
  error: string | null
}

export function useRealtimePrediction({
  userId,
  enabled = true,
}: UseRealtimePredictionOptions): UseRealtimePredictionReturn {
  const [latestVerification, setLatestVerification] = useState<VerifiedPrediction | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null)

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.unsubscribe()
      channelRef.current = null
      setIsConnected(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled || !userId) {
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
      return
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const channel = supabase
      .channel(`predictions:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_predictions",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const pred = payload.new as VerifiedPrediction
          // Only notify on status changes (WON/LOST)
          if (pred.status === "WON" || pred.status === "LOST") {
            setLatestVerification(pred)
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsConnected(true)
          setError(null)
        } else if (status === "CHANNEL_ERROR") {
          setIsConnected(false)
          setError("Realtime subscription failed")
        }
      })

    channelRef.current = channel

    return cleanup
  }, [userId, enabled, cleanup])

  return { latestVerification, isConnected, error }
}

/**
 * Hook for admin: subscribe to ALL prediction verifications.
 * Used in the admin dashboard to monitor auto-verify activity.
 */
export function useRealtimeVerificationFeed(enabled = true) {
  const [events, setEvents] = useState<VerifiedPrediction[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null)

  useEffect(() => {
    if (!enabled) return

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) return

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const channel = supabase
      .channel("admin:verifications")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_predictions",
          filter: "status=neq.PENDING",
        },
        (payload) => {
          const pred = payload.new as VerifiedPrediction
          setEvents((prev) => [pred, ...prev].slice(0, 50)) // Keep last 50
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED")
      })

    channelRef.current = channel

    return () => {
      channel?.unsubscribe()
    }
  }, [enabled])

  return { events, isConnected }
}
