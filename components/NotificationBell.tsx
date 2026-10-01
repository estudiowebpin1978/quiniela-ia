"use client"
import { useState, useEffect, useCallback, useRef } from "react"

interface Notification {
  id: string
  type: string
  title: string
  body: string
  data: Record<string, unknown> | null
  read: boolean
  created_at: string
}

const TYPE_ICONS: Record<string, string> = {
  draw_loaded: "🎱",
  prediction_won: "🏆",
  prediction_lost: "❌",
  trial_expiring: "⏰",
  premium_expiring: "⭐",
  system: "📢",
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "ahora"
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = "sine"
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08)
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.16)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch { /* non-fatal */ }
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevUnreadRef = useRef(0)

  const fetchNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem("sb-access-token") || ""
      if (!token) return
      const res = await fetch("/api/notifications?limit=20", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      const newUnread = data.unreadCount || 0
      if (newUnread > prevUnreadRef.current) {
        playNotifSound()
      }
      prevUnreadRef.current = newUnread
      setNotifications(data.notifications || [])
      setUnreadCount(newUnread)
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void fetchNotifications() }, 0)
    intervalRef.current = setInterval(() => { void fetchNotifications() }, 30000)
    return () => {
      window.clearTimeout(initialLoad)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchNotifications])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const markAllRead = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem("sb-access-token") || ""
      await fetch("/api/notifications", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      setUnreadCount(0)
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch { /* non-fatal */ }
    setLoading(false)
  }

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: "6px 12px",
          borderRadius: 10,
          border: unreadCount > 0 ? "1.5px solid rgba(255,51,102,.5)" : "1.5px solid rgba(37,244,238,.2)",
          background: unreadCount > 0 ? "rgba(255,51,102,.12)" : "rgba(37,244,238,.06)",
          color: unreadCount > 0 ? "#ff3366" : "#25F4EE",
          fontSize: 14,
          cursor: "pointer",
          fontFamily: "inherit",
          position: "relative",
          transition: "all .2s",
          boxShadow: unreadCount > 0 ? "0 2px 12px rgba(255,51,102,.2)" : "none",
        }}
        title="Notificaciones"
      >
        <span style={{ display: "inline-block", animation: unreadCount > 0 ? "bell-ring 1s ease-in-out infinite" : "none" }}>
          {unreadCount > 0 ? "🔔" : "🔕"}
        </span>
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            background: "#ff3366", color: "#fff",
            borderRadius: "50%", minWidth: 16, height: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 700, padding: "0 4px",
          }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 8,
          width: 360, maxHeight: 440, overflowY: "auto",
          background: "linear-gradient(180deg,rgba(15,15,30,.98),rgba(8,8,18,.99))",
          backdropFilter: "blur(24px)",
          border: "1.5px solid rgba(37,244,238,.12)", borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,.7), 0 0 30px rgba(37,244,238,.05)",
          zIndex: 1000,
        }}>
          {/* Header */}
          <div style={{
            padding: "16px 18px 12px",
            borderBottom: "1px solid rgba(255,255,255,.06)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "linear-gradient(180deg,rgba(37,244,238,.06),transparent)",
          }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", fontFamily: "var(--font-display)" }}>
              🔔 Notificaciones
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={loading}
                style={{
                  background: "rgba(37,244,238,.1)", border: "1px solid rgba(37,244,238,.2)",
                  color: "#25F4EE", borderRadius: 8,
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  padding: "5px 10px",
                  opacity: loading ? 0.5 : 1,
                  transition: "all .15s",
                }}
              >
                {loading ? "..." : "Marcar leídas"}
              </button>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div style={{ padding: "40px 18px", textAlign: "center", color: "#64748b", fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔕</div>
              Sin notificaciones
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                style={{
                  padding: "14px 18px",
                  borderBottom: "1px solid rgba(255,255,255,.04)",
                  background: n.read ? "transparent" : "rgba(37,244,238,.04)",
                  display: "flex", gap: 12, alignItems: "flex-start",
                  cursor: "pointer",
                  transition: "all .15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,.04)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = n.read ? "transparent" : "rgba(37,244,238,.04)" }}
                onClick={() => {
                  playNotifSound()
                  if (!n.read) markAllRead()
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>
                  {TYPE_ICONS[n.type] || "📢"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc", marginBottom: 3 }}>
                    {n.title}
                    {!n.read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff3366", display: "inline-block", marginLeft: 6, verticalAlign: "middle", boxShadow: "0 0 6px rgba(255,51,102,.5)" }} />}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.body}
                  </div>
                  <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
                    {timeAgo(n.created_at)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
