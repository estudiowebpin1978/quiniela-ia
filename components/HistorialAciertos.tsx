"use client"
import { useState, useEffect, useMemo } from "react"

interface SorteoHistorial {
  date: string
  turno: string
  numbers: number[]
  fuente?: string
}

interface PrediccionGuardada {
  fecha: string
  turno: string
  numeros: string[]
  aciertos?: { numero: string; puesto: number; tipo: number }[]
}

interface Props {
  predictions?: PrediccionGuardada[]
}

export default function HistorialAciertos({ predictions = [] }: Props) {
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
    } finally {
      setLoading(false)
    }
  }

  const drawsWithHits = useMemo(() => {
    return draws.map(draw => {
      const pred = predictions.find(p => {
        const pTurno = (p.turno || "").replace(/-\d+cifras?$/i, "").toLowerCase()
        return p.fecha === draw.date && pTurno === draw.turno.toLowerCase()
      })
      const drawNums = draw.numbers.map(n => String(Number(n) % 100).padStart(2, "0"))
      const predNums = pred?.numeros || []
      const hits = predNums.filter(n => drawNums.includes(n.padStart(2, "0")))
      return { ...draw, hits, predNums, totalAciertos: hits.length }
    })
  }, [draws, predictions])

  const totalAciertosGlobal = drawsWithHits.reduce((sum, d) => sum + d.totalAciertos, 0)
  const sorteosConAciertos = drawsWithHits.filter(d => d.totalAciertos > 0).length

  const displayedDraws = expanded ? drawsWithHits : drawsWithHits.slice(0, 10)

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[1,2,3,4,5].map(i=>(
          <div key={i} style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",borderRadius:12,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <div className="skeleton" style={{width:60,height:14,borderRadius:4}}/>
                <div className="skeleton" style={{width:80,height:12,borderRadius:4}}/>
              </div>
              <div className="skeleton" style={{width:40,height:10,borderRadius:4}}/>
            </div>
            <div style={{display:"flex",gap:4}}>
              {[1,2,3,4,5,6,7,8,9,10].map(j=>(
                <div key={j} className="skeleton" style={{width:28,height:22,borderRadius:6}}/>
              ))}
            </div>
          </div>
        ))}
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
      {predictions.length > 0 && (
        <div style={{
          display: "flex", gap: 8, marginBottom: 12, padding: "10px 14px",
          background: "linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.05))",
          border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12
        }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#4ade80" }}>{totalAciertosGlobal}</div>
            <div style={{ fontSize: 9, color: "#64748b", fontWeight: 600 }}>ACIERTOS TOTALES</div>
          </div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#a855f7" }}>{sorteosConAciertos}</div>
            <div style={{ fontSize: 9, color: "#64748b", fontWeight: 600 }}>SORTEOS CON HIT</div>
          </div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#e2e8f0" }}>
              {drawsWithHits.length > 0 ? Math.round((sorteosConAciertos / drawsWithHits.length) * 100) : 0}%
            </div>
            <div style={{ fontSize: 9, color: "#64748b", fontWeight: 600 }}>PRECISIÓN</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {displayedDraws.map((draw, idx) => (
          <div
            key={`${draw.date}-${draw.turno}-${idx}`}
            style={{
              background: draw.totalAciertos > 0 ? "rgba(34,197,94,0.05)" : "rgba(255,255,255,.03)",
              border: draw.totalAciertos > 0 ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,.08)",
              borderRadius: 12,
              padding: 14,
              transition: "all .2s"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{draw.turno}</span>
                <span style={{ fontSize: 11, color: "#64748b" }}>{draw.date}</span>
                {draw.totalAciertos > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: "#4ade80",
                    background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)",
                    borderRadius: 8, padding: "2px 8px"
                  }}>
                    {draw.totalAciertos} HIT{draw.totalAciertos > 1 ? "S" : ""}
                  </span>
                )}
              </div>
              {draw.fuente && (
                <span style={{ fontSize: 9, color: "#475569", background: "rgba(255,255,255,.05)", padding: "2px 8px", borderRadius: 6 }}>
                  {draw.fuente}
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {draw.numbers.map((num, i) => {
                const numStr = String(num).padStart(2, "0")
                const isHit = draw.predNums.some(p => p.padStart(2, "0") === numStr)
                return (
                  <span
                    key={i}
                    style={{
                      background: isHit ? "rgba(34,197,94,0.2)" : "rgba(168,85,247,.12)",
                      border: isHit ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(168,85,247,.2)",
                      borderRadius: 6,
                      padding: "3px 8px",
                      fontSize: 12,
                      fontWeight: isHit ? 800 : 600,
                      color: isHit ? "#4ade80" : "#c4b5fd",
                      fontVariantNumeric: "tabular-nums",
                      transition: "all .2s"
                    }}
                  >
                    {numStr}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {drawsWithHits.length > 10 && (
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
          {expanded ? "▲ Mostrar menos" : `▼ Ver los ${drawsWithHits.length} sorteos`}
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