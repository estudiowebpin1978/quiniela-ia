"use client"
import { useState, useEffect } from "react"

interface SorteoHistorial {
  date: string
  turno: string
  numbers: number[]
  fuente?: string
}

export default function HistorialAciertos() {
  const [draws, setDraws] = useState<SorteoHistorial[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    fetchDraws()
  }, [])

  async function fetchDraws() {
    try {
      const res = await fetch("/api/draw?limit=30")
      if (!res.ok) throw new Error("Error fetching draws")
      const data = await res.json()
      setDraws(data.draws || data || [])
    } catch (err) {
      console.error("Error fetching draws:", err)
    } finally {
      setLoading(false)
    }
  }

  const displayedDraws = expanded ? draws : draws.slice(0, 10)

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>
        <div style={{ fontSize: 13 }}>Cargando historial...</div>
      </div>
    )
  }

  if (draws.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>
        <div style={{ fontSize: 13 }}>No hay resultados cargados aún</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {displayedDraws.map((draw, idx) => (
          <div
            key={`${draw.date}-${draw.turno}-${idx}`}
            style={{
              background: "rgba(255,255,255,.03)",
              border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 12,
              padding: 14,
              transition: "all .2s"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{draw.turno}</span>
                <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>{draw.date}</span>
              </div>
              {draw.fuente && (
                <span style={{ fontSize: 9, color: "#475569", background: "rgba(255,255,255,.05)", padding: "2px 8px", borderRadius: 6 }}>
                  {draw.fuente}
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {draw.numbers.map((num, i) => (
                <span
                  key={i}
                  style={{
                    background: "rgba(168,85,247,.12)",
                    border: "1px solid rgba(168,85,247,.2)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#c4b5fd",
                    fontVariantNumeric: "tabular-nums"
                  }}
                >
                  {String(num).padStart(2, "0")}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {draws.length > 10 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "10px",
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 10,
            color: "#94a3b8",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit"
          }}
        >
          {expanded ? "▲ Mostrar menos" : `▼ Ver los ${draws.length} sorteos`}
        </button>
      )}

      <div style={{ marginTop: 12, padding: 10, background: "rgba(255,255,255,.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,.05)" }}>
        <div style={{ fontSize: 10, color: "#475569", textAlign: "center", lineHeight: 1.6 }}>
          Datos oficiales de los sorteos de la Quiniela Nacional de Buenos Aires.
          <br />
          Fuente: quinielanacional1.com.ar · Lotería de la Ciudad de Buenos Aires
        </div>
      </div>
    </div>
  )
}
