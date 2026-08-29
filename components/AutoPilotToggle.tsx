"use client"

import { useState, useEffect, useCallback } from "react"
import { Bot, Loader2, AlertTriangle } from "lucide-react"
import { getAccessToken } from "@/lib/auth"

interface AutoPilotToggleProps {
  userId: string
  userRole: string
  premiumUntil: string | null
  compact?: boolean
}

export default function AutoPilotToggle({ userId, userRole, premiumUntil, compact }: AutoPilotToggleProps) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPremium = userRole === "premium" || userRole === "admin"
  const isTrialActive = premiumUntil && new Date(premiumUntil) > new Date()

  useEffect(() => {
    async function loadState() {
      try {
        const token = getAccessToken()
        if (!token) { setLoading(false); return }
        const res = await fetch("/api/user/auto-predict", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setEnabled(data.enabled ?? false)
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }
    loadState()
  }, [])

  const toggle = useCallback(async () => {
    if (saving) return
    setSaving(true)
    setError(null)

    try {
      const token = getAccessToken()
      if (!token) throw new Error("No autenticado")
      const newEnabled = !enabled
      const res = await fetch("/api/user/auto-predict", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: newEnabled }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Error al guardar")
      }

      setEnabled(newEnabled)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido")
    } finally {
      setSaving(false)
    }
  }, [enabled, saving])

  if (loading) return null

  // ─── Compact mode: inline pill next to generate button ──────────
  if (compact) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <button
          onClick={toggle}
          disabled={saving}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "10px 14px", borderRadius: 12,
            cursor: saving ? "not-allowed" : "pointer",
            background: enabled
              ? "linear-gradient(135deg, rgba(34,197,94,.2), rgba(34,197,94,.08))"
              : "rgba(255,255,255,.06)",
            border: enabled ? "1.5px solid rgba(34,197,94,.4)" : "1.5px solid rgba(255,255,255,.12)",
            transition: "all 0.3s ease",
            opacity: saving ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          <Bot className="w-4 h-4" style={{ color: enabled ? "#22c55e" : "#94a3b8", flexShrink: 0 }} />
          <span className="piloto-label" style={{ fontSize: 12, fontWeight: 700, color: enabled ? "#86efac" : "#94a3b8" }}>
            Piloto Auto
          </span>
          {/* Toggle dot */}
          <div style={{
            width: 32, height: 18, borderRadius: 9,
            background: enabled ? "#22c55e" : "rgba(255,255,255,.15)",
            position: "relative", transition: "background 0.3s ease", flexShrink: 0,
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: 7, background: "#fff",
              position: "absolute", top: 2,
              left: enabled ? 16 : 2,
              transition: "left 0.3s ease",
              boxShadow: "0 1px 2px rgba(0,0,0,.3)"
            }} />
          </div>
        </button>
        {error && (
          <div style={{ fontSize: 10, color: "#fca5a5", display: "flex", alignItems: "center", gap: 4, paddingLeft: 4 }}>
            <AlertTriangle className="w-3 h-3" /> {error}
          </div>
        )}
      </div>
    )
  }

  // ─── Full mode: card layout ─────────────────────────────────────
  return (
    <div style={{
      padding: "16px", borderRadius: 14,
      background: enabled
        ? "linear-gradient(135deg, rgba(34,197,94,.08), rgba(59,130,246,.08))"
        : "rgba(255,255,255,.04)",
      border: enabled
        ? "1px solid rgba(34,197,94,.25)"
        : "1px solid rgba(255,255,255,.08)",
      transition: "all 0.3s ease"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: enabled ? "rgba(34,197,94,.15)" : "rgba(255,255,255,.06)",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.3s ease"
          }}>
            <Bot className="w-5 h-5" style={{ color: enabled ? "#22c55e" : "#64748b" }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>
              Piloto Automático
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {enabled
                ? "La IA genera predicciones antes de cada turno"
                : "Se generan predicciones automáticamente"}
            </div>
          </div>
        </div>

        <button
          onClick={toggle}
          disabled={saving}
          style={{
            width: 48, height: 26, borderRadius: 13, border: "none", cursor: saving ? "not-allowed" : "pointer",
            background: enabled ? "#22c55e" : "rgba(255,255,255,.15)",
            position: "relative", transition: "background 0.3s ease",
            opacity: saving ? 0.6 : 1,
          }}
        >
          <div style={{
            width: 20, height: 20, borderRadius: 10, background: "#fff",
            position: "absolute", top: 3,
            left: enabled ? 25 : 3,
            transition: "left 0.3s ease",
            boxShadow: "0 1px 3px rgba(0,0,0,.3)"
          }} />
        </button>
      </div>

      {enabled && (
        <div style={{
          marginTop: 10, padding: "8px 12px", borderRadius: 8,
          background: "rgba(34,197,94,.08)", fontSize: 11, color: "#86efac",
          display: "flex", alignItems: "center", gap: 6
        }}>
          <span>✅</span>
          <span>
            Activo — Se generarán predicciones para los 5 turnos diarios.
            {!isPremium && !isTrialActive && " Límite: 10 predicciones (modo Free)."}
          </span>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 8, padding: "6px 10px", borderRadius: 8,
          background: "rgba(239,68,68,.1)", fontSize: 11, color: "#fca5a5",
          display: "flex", alignItems: "center", gap: 6
        }}>
          <AlertTriangle className="w-3 h-3" />
          {error}
        </div>
      )}
    </div>
  )
}
