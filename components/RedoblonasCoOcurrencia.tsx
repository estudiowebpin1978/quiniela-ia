"use client"

/**
 * Redoblonas por co-ocurrencia histórica — panel Premium.
 * Sólo agregados históricos reales (vía /api/redoblonas). Estadística
 * histórica, no garantía de futuros. Sin ventaja demostrada sobre el azar.
 */
import { useEffect, useState } from "react"

interface ParRow {
  par: string
  frecuencia: number
  probConjunta: number
  probA_dado_B: number
  probB_dado_A: number
  sobreAzar: number
}

interface Resp {
  ok: boolean
  turno: string
  sorteos: number
  desde: string | null
  hasta: string | null
  azarConjunta: number
  azarCondicional: number
  pares: ParRow[]
  nota: string
}

function esParRow(value: unknown): value is ParRow {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  return (
    typeof row.par === "string" &&
    typeof row.frecuencia === "number" &&
    typeof row.probConjunta === "number" &&
    typeof row.probA_dado_B === "number" &&
    typeof row.probB_dado_A === "number" &&
    typeof row.sobreAzar === "number"
  )
}

function esRespuesta(value: unknown): value is Resp {
  if (!value || typeof value !== "object") return false
  const data = value as Record<string, unknown>
  return (
    data.ok === true &&
    typeof data.turno === "string" &&
    typeof data.sorteos === "number" &&
    (data.desde === null || typeof data.desde === "string") &&
    (data.hasta === null || typeof data.hasta === "string") &&
    typeof data.azarConjunta === "number" &&
    typeof data.azarCondicional === "number" &&
    Array.isArray(data.pares) &&
    data.pares.every(esParRow) &&
    typeof data.nota === "string"
  )
}

export default function RedoblonasCoOcurrencia({ turno }: { turno: string }) {
  const [resultado, setResultado] = useState<{
    turno: string
    data: Resp | null
    error: string | null
    loading: boolean
  }>({ turno, data: null, error: null, loading: true })

  useEffect(() => {
    let vivo = true
    fetch(`/api/redoblonas?turno=${encodeURIComponent(turno)}&limit=800`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (!vivo) return
        if (!esRespuesta(raw)) {
          setResultado({ turno, data: null, error: "Estadística histórica no disponible por ahora.", loading: false })
          return
        }
        setResultado({ turno, data: raw, error: null, loading: false })
      })
      .catch(() => vivo && setResultado({ turno, data: null, error: "No se pudo cargar la co-ocurrencia.", loading: false }))
    return () => {
      vivo = false
    }
  }, [turno])

  const mismoTurno = resultado.turno === turno
  const data = mismoTurno ? resultado.data : null
  const error = mismoTurno ? resultado.error : null
  const cargando = !mismoTurno || resultado.loading

  return (
    <details
      style={{
        margin: "12px 0 0",
        border: "1px solid rgba(168,85,247,.35)",
        borderRadius: 12,
        background: "rgba(168,85,247,.07)",
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          padding: "10px 12px",
          fontSize: 13,
          fontWeight: 700,
          color: "#d8b4fe",
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        🔀 Redoblonas por co-ocurrencia histórica <span style={{ fontSize: 10, color: "#a78bfa", fontWeight: 400 }}> Premium</span>
      </summary>
      <div style={{ padding: "0 12px 12px", fontSize: 12, lineHeight: 1.6 }}>
        {cargando && <p style={{ color: "#94a3b8", margin: "6px 0" }}>Calculando co-ocurrencias sobre el historial oficial…</p>}
        {error && <p style={{ color: "#fbbf24", margin: "6px 0" }}>{error}</p>}
        {data && (
          <>
            <p style={{ color: "#cbd5e1", margin: "6px 0 8px", fontSize: 11 }}>
              {data.sorteos} sorteos oficiales · {data.desde} → {data.hasta} ·{" "}
              <b>los pares salieron juntos</b> en esa proporción histórica:
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ color: "#a5b4fc", textAlign: "left" }}>
                    <th style={{ padding: "4px 6px" }}>Par</th>
                    <th style={{ padding: "4px 6px" }}>Veces</th>
                    <th style={{ padding: "4px 6px" }}>P(ambos)</th>
                    <th style={{ padding: "4px 6px" }}>P(2º | 1º)</th>
                    <th style={{ padding: "4px 6px" }}>Sobre azar</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pares.map((p, i) => (
                    <tr key={i} style={{ borderTop: "1px solid rgba(168,85,247,.14)", color: "#e2e8f0" }}>
                      <td style={{ padding: "4px 6px", fontWeight: 700 }}>{p.par}</td>
                      <td style={{ padding: "4px 6px" }}>{p.frecuencia}</td>
                      <td style={{ padding: "4px 6px" }}>{(p.probConjunta * 100).toFixed(1)}%</td>
                      <td style={{ padding: "4px 6px" }}>{(p.probB_dado_A * 100).toFixed(1)}%</td>
                      <td style={{ padding: "4px 6px", color: p.sobreAzar >= 1 ? "#22c55e" : "#f87171" }}>
                        ×{p.sobreAzar.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: "#64748b", margin: "8px 0 0", fontSize: 10, lineHeight: 1.5 }}>
              Azar: P(ambos en el sorteo) ≈ {(data.azarConjunta * 100).toFixed(2)}% · P(2º | 1º presente) ≈ {(data.azarCondicional * 100).toFixed(1)}%.{" "}
              {data.nota}
            </p>
          </>
        )}
      </div>
    </details>
  )
}
