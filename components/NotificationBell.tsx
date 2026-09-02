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

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem("sb-access-token") || ""
      if (!token) return
      const res = await fetch("/api/notifications?limit=20", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => {
    fetchNotifications()
    intervalRef.current = setInterval(fetchNotifications, 30000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
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
          padding: "5px 10px",
          borderRadius: 7,
          border: unreadCount > 0 ? "1px solid rgba(255,51,102,.5)" : "1px solid rgba(37,244,238,.2)",
          background: unreadCount > 0 ? "rgba(255,51,102,.15)" : "transparent",
          color: unreadCount > 0 ? "#ff3366" : "#25F4EE",
          fontSize: 11,
          cursor: "pointer",
          fontFamily: "inherit",
          position: "relative",
        }}
        title="Notificaciones"
      >
        {unreadCount > 0 ? "🔔" : "🔕"}
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
          width: 340, maxHeight: 420, overflowY: "auto",
          background: "rgba(15,15,25,.97)", backdropFilter: "blur(20px)",
          border: "1px solid rgba(37,244,238,.15)", borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,.6)",
          zIndex: 1000,
        }}>
          {/* Header */}
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "var(--font-display)" }}>
              Notificaciones
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={loading}
                style={{
                  background: "none", border: "none", color: "#25F4EE",
                  fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                  opacity: loading ? 0.5 : 1,
                }}
              >
                Marcar leídas
              </button>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Sin notificaciones
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid rgba(255,255,255,.04)",
                  background: n.read ? "transparent" : "rgba(37,244,238,.04)",
                  display: "flex", gap: 10, alignItems: "flex-start",
                  cursor: "pointer",
                  transition: "background .15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,.04)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = n.read ? "transparent" : "rgba(37,244,238,.04)" }}
              >
                <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>
                  {TYPE_ICONS[n.type] || "📢"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 2 }}>
                    {n.title}
                    {!n.read && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ff3366", display: "inline-block", marginLeft: 6, verticalAlign: "middle" }} />}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.body}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, opacity: 0.6 }}>
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
