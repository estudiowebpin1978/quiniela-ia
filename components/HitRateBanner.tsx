"use client"

import { useState, useEffect } from "react"

/**
 * HitRateBanner — Social proof component showing recent AI prediction wins.
 * Creates FOMO for free users by displaying actual hit rate data.
 *
 * Fetches from /api/engine-metrics to get recent hit rates.
 */

interface HitRateData {
  turno: string
  hits: number
  total: number
  rate: number
  lastHitDate: string | null
}

export default function HitRateBanner() {
  const [data, setData] = useState<HitRateData[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHitRate = async () => {
      try {
        const resp = await fetch("/api/engine-metrics?summary=true", {
          signal: AbortSignal.timeout(8000),
        })
        if (!resp.ok) return
        const json = await resp.json()

        // Build hit rate data from engine metrics
        if (json.metrics && Array.isArray(json.metrics)) {
          const byTurno = new Map<string, { hits: number; total: number }>()
          for (const m of json.metrics) {
            const existing = byTurno.get(m.turno) || { hits: 0, total: 0 }
            existing.hits += m.correct_predictions || 0
            existing.total += m.total_predictions || 0
            byTurno.set(m.turno, existing)
          }

          const hitData: HitRateData[] = Array.from(byTurno.entries())
            .map(([turno, { hits, total }]) => ({
              turno,
              hits,
              total,
              rate: total > 0 ? hits / total : 0,
              lastHitDate: null,
            }))
            .filter(d => d.total > 0)
            .sort((a, b) => b.rate - a.rate)

          setData(hitData)
        }
      } catch {
        // Silently fail — banner is best-effort
      } finally {
        setLoading(false)
      }
    }

    fetchHitRate()
  }, [])

  if (loading || !data || data.length === 0) return null

  const totalHits = data.reduce((sum, d) => sum + d.hits, 0)
  const totalPredictions = data.reduce((sum, d) => sum + d.total, 0)
  const overallRate = totalPredictions > 0 ? Math.round((totalHits / totalPredictions) * 100) : 0

  // Only show if we have meaningful data
  if (totalPredictions < 10) return null

  return (
    <div
      style={{
        margin: "12px 16px",
        padding: "14px 16px",
        background: "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.08))",
        borderRadius: 12,
        border: "1px solid rgba(16,185,129,0.25)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>🎯</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#10b981" }}>
          Precisión del Motor IA
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontWeight: 700,
            color: "#fff",
            background: "rgba(16,185,129,0.25)",
            padding: "2px 8px",
            borderRadius: 20,
          }}
        >
          {overallRate}% aciertos
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {data.slice(0, 5).map((d) => (
          <div
            key={d.turno}
            style={{
              flex: "1 1 auto",
              minWidth: 80,
              padding: "6px 10px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: 8,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>
              {d.turno}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#10b981" }}>
              {Math.round(d.rate * 100)}%
            </div>
            <div style={{ fontSize: 9, color: "#64748b" }}>
              {d.hits}/{d.total}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 9, color: "#64748b", marginTop: 8, textAlign: "center" }}>
        Datos reales de los últimos 30 días · Actualización automática
      </div>
    </div>
  )
}
