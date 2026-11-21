"use client"

/**
 * Plan Operativo de 5 Redoblonas — estructura exacta pedida por el dueño:
 *   A = top-1 del engine · B = top-2 · C = top-3 · D = top-4
 *   1. A-B  → Puestos Oficiales 10 · 10   (Base principal)
 *   2. A-C  → Puestos Oficiales 10 · 20   (Cruce ancla 1)
 *   3. B-D  → Puestos Oficiales 10 · 20   (Cruce ancla 2)
 *   4. B-A  → Puestos Oficiales 20 · 20   (Cobertura inversa)
 *   5. C-D  → Puestos Oficiales 20 · 20   (Respaldo refuerzos)
 *
 * "Puestos Oficiales" (criterio interno del plan, no oficial LOTBA):
 *   10 = el número debe salir entre las 10 PRIMERAS posiciones del extracto;
 *   20 = el número puede salir en CUALQUIER posición del extracto (00-99, 2 cifras).
 *
 * Determinista y basado en el análisis del día (dt.ranking top-4).
 * Estadística histórica real vía /api/redoblonas?pares=… (sin simulación).
 * Sin ventaja demostrada sobre el azar — etiquetado honestamente.
 */
import { useEffect, useMemo, useState } from "react"
import { getAccessToken } from "@/lib/auth"

interface Props {
  turno: string
  /** [A, B, C, D] — top-4 de 2 cifras del análisis actual. */
  anchors: [string, string, string, string]
}

interface ParPayload {
  label: string
  frecuencia: number
  probConjunta: number
  sobreAzar: number
}

interface StatsPayload {
  ok: boolean
  muestra: number
  desde: string | null
  hasta: string | null
  pares: ParPayload[]
  alMenos1: number
  alMenos2: number
  alMenos3: number
}

function esParPayload(value: unknown): value is ParPayload {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  return (
    typeof row.label === "string" &&
    typeof row.frecuencia === "number" &&
    typeof row.probConjunta === "number" &&
    typeof row.sobreAzar === "number"
  )
}

function esStatsPayload(value: unknown): value is StatsPayload {
  if (!value || typeof value !== "object") return false
  const data = value as Record<string, unknown>
  return (
    data.ok === true &&
    typeof data.muestra === "number" &&
    (data.desde === null || typeof data.desde === "string") &&
    (data.hasta === null || typeof data.hasta === "string") &&
    Array.isArray(data.pares) &&
    data.pares.every(esParPayload) &&
    typeof data.alMenos1 === "number" &&
    typeof data.alMenos2 === "number" &&
    typeof data.alMenos3 === "number"
  )
}

const PLAN: Array<{
  orden: number
  rol: string
  a: number // índice en anchors
  b: number
  puestos: string
  explicacion: string
}> = [
  { orden: 1, rol: "Base principal", a: 0, b: 1, puestos: "10 · 10", explicacion: "A y B entre las 10 primeras posiciones" },
  { orden: 2, rol: "Cruce ancla 1", a: 0, b: 2, puestos: "10 · 20", explicacion: "A entre las 10 primeras posiciones · C en cualquier posición" },
  { orden: 3, rol: "Cruce ancla 2", a: 1, b: 3, puestos: "10 · 20", explicacion: "B entre las 10 primeras posiciones · D en cualquier posición" },
  { orden: 4, rol: "Cobertura inversa", a: 1, b: 0, puestos: "20 · 20", explicacion: "B y A en cualquier posición (orden inverso del Par base)" },
  { orden: 5, rol: "Respaldo refuerzos", a: 2, b: 3, puestos: "20 · 20", explicacion: "C y D en cualquier posición" },
]

type ParStatus = "frecuente" | "normal" | "nuevo"

const STATUS_STYLE: Record<ParStatus, { etiqueta: string; color: string; fondo: string }> = {
  frecuente: { etiqueta: "FRECUENTE", color: "#4ade80", fondo: "rgba(34,197,94,.14)" },
  normal: { etiqueta: "NORMAL", color: "#fbbf24", fondo: "rgba(251,191,36,.12)" },
  nuevo: { etiqueta: "NUEVO", color: "#38bdf8", fondo: "rgba(56,189,248,.12)" },
}

function statusDePar(freq: number | undefined, sobreAzar: number | undefined): ParStatus {
  if (freq === 0) return "nuevo"
  if ((sobreAzar ?? 0) >= 1.2) return "frecuente"
  return "normal"
}

export default function RedoblonasPlan5({ turno, anchors }: Props) {
  const anchorsValidos =
    Array.isArray(anchors) &&
    anchors.length >= 4 &&
    anchors.every((a) => typeof a === "string" && a.length > 0)

  const pares = useMemo(
    () => PLAN.map((s) => [anchors[s.a], anchors[s.b]] as [string, string]),
    [anchors],
  )
  const paresQuery = useMemo(
    () => (anchorsValidos ? pares.map(([a, b]) => `${a}-${b}`).join(",") : ""),
    [pares, anchorsValidos],
  )
  const requestKey = `${turno}:${paresQuery}`
  const [resultadoStats, setResultadoStats] = useState<{
    key: string
    stats: StatsPayload | null
    error: string | null
  }>({ key: "", stats: null, error: null })

  useEffect(() => {
    if (!anchorsValidos) return
    let vivo = true
    fetch(`/api/redoblonas?turno=${encodeURIComponent(turno)}&limit=400&pares=${encodeURIComponent(paresQuery)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (!vivo) return
        if (!esStatsPayload(raw)) {
          setResultadoStats({ key: requestKey, stats: null, error: "Historial no disponible para calcular rendimiento." })
          return
        }
        setResultadoStats({ key: requestKey, stats: raw, error: null })
      })
      .catch(() => vivo && setResultadoStats({ key: requestKey, stats: null, error: "No se pudo cargar el historial." }))
    return () => {
      vivo = false
    }
  }, [turno, paresQuery, anchorsValidos, requestKey])

  const statsActuales = resultadoStats.key === requestKey ? resultadoStats : null
  const stats = statsActuales?.stats ?? null
  const statsError = statsActuales?.error ?? null
  // Texto de "Puestos Oficiales" tal como se pidió — criterio interno del plan
  const AZAR_CONJUNTA = ((20 * 19) / (100 * 99)) * 100

  // Guardado de las 5 jugadas como predicción (Premium) — verifica solas
  const [guardando, setGuardando] = useState<"idle" | "ok" | "err" | "duplicado" | "saving">("idle")
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)

  const paresParaGuardar = useMemo(
    () => pares.map(([a, b]) => `${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`),
    [pares],
  )

  const guardarPlan = async () => {
    setGuardando("saving")
    setErrorGuardado(null)
    try {
      const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })
      const accessToken = getAccessToken() ?? ""
      const rd = [paresParaGuardar[0], paresParaGuardar[1], paresParaGuardar[2], paresParaGuardar[3], paresParaGuardar[4]]
      const body = {
        date: hoy,
        turno,
        numeros: { "2": [anchors[0], anchors[1]], r: rd },
      }
      const r = await fetch("/api/mis-predicciones", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      })
      const responseBody: unknown = await r.json().catch(() => null)
      const d = responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)
        ? responseBody as Record<string, unknown>
        : {}
      if (r.ok) {
        setGuardando("ok")
      } else if (r.status === 409 || d.duplicate === true) {
        setGuardando("duplicado")
      } else {
        setGuardando("err")
        setErrorGuardado(typeof d.error === "string" ? d.error : `Error del servidor (${r.status})`)
      }
    } catch (e) {
      setGuardando("err")
      setErrorGuardado(e instanceof Error ? e.message : "Error de red")
    }
  }

  if (!anchorsValidos) return null

  return (
    <div
      style={{
        marginTop: 12,
        border: "1px solid rgba(250, 204, 21, .4)",
        borderRadius: 14,
        background: "linear-gradient(160deg, rgba(250,204,21,.10), rgba(250,204,21,.03))",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          padding: "10px 12px",
          borderBottom: "1px solid rgba(250,204,21,.25)",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 800, color: "#fde047" }}>📦 Plan Operativo de 5 Redoblonas</span>
        <span style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: "#a16207", background: "rgba(250,204,21,.18)", borderRadius: 6, padding: "2px 6px" }}>
          Premium
        </span>
      </div>

      <div style={{ padding: "10px 12px 12px", fontSize: 12, color: "#e7e5e4", lineHeight: 1.6 }}>
        <div style={{ fontSize: 11, color: "#a8a29e", marginBottom: 8 }}>
          Anclas del engine (top-4 de 2 cifras de <b>este análisis</b>):{" "}
          <b style={{ color: "#fde047" }}>A={anchors[0]} · B={anchors[1]} · C={anchors[2]} · D={anchors[3]}</b>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#a5b4fc" }}>
                <th style={{ padding: "4px 6px" }}>#</th>
                <th style={{ padding: "4px 6px" }}>Par</th>
                <th style={{ padding: "4px 6px" }}>Role</th>
                <th style={{ padding: "4px 6px" }}>Puestos Oficiales</th>
                <th style={{ padding: "4px 6px" }}>Hist.</th>
                <th style={{ padding: "4px 6px" }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {PLAN.map((s, i) => {
                const [x, y] = [anchors[s.a], anchors[s.b]]
                const st = stats?.pares?.find(
                  (p) => p.label === `${String(x).padStart(2, "0")}-${String(y).padStart(2, "0")}` ||
                        p.label === `${String(y).padStart(2, "0")}-${String(x).padStart(2, "0")}`,
                )
                const status = statusDePar(st?.frecuencia, st?.sobreAzar)
                const style = STATUS_STYLE[status]
                return (
                  <tr
                    key={s.orden}
                    style={{
                      borderTop: "1px solid rgba(250,204,21,.14)",
                      background: `linear-gradient(90deg, ${style.fondo}, transparent 55%)`,
                    }}
                  >
                    <td style={{ padding: "4px 6px", color: "#a8a29e" }}>{s.orden}</td>
                    <td style={{ padding: "4px 6px", fontWeight: 700, color: status === "nuevo" ? "#7dd3fc" : "#fde047" }}>
                      {x} - {y}
                    </td>
                    <td style={{ padding: "4px 6px", color: "#cbd5e1" }} title={s.explicacion}>
                      {s.rol}
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontWeight: 700,
                          background: "rgba(250,204,21,.14)",
                          borderRadius: 5,
                          padding: "1px 6px",
                          color: "#fde047",
                        }}
                      >
                        {s.puestos}
                      </span>
                    </td>
                    <td style={{ padding: "4px 6px", color: "#a8a29e" }}>
                      {st ? `${st.frecuencia}×` : "…"}
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          letterSpacing: 0.5,
                          color: style.color,
                          background: `${style.color}22`,
                          border: `1px solid ${style.color}55`,
                          borderRadius: 6,
                          padding: "2px 6px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {style.etiqueta}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, fontSize: 10, color: "#a8a29e", lineHeight: 1.5 }}>
          <span style={{ color: "#4ade80" }}>● FRECUENTE</span> = ≥1.2× azar en la muestra ·{" "}
          <span style={{ color: "#fbbf24" }}>● NORMAL</span> = entorno azar ·{" "}
          <span style={{ color: "#38bdf8" }}>● NUEVO</span> = 0 veces en la muestra.
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "#a8a29e", lineHeight: 1.5 }}>
          <b style={{ color: "#e7e5e4" }}>Puestos Oficiales:</b> 10 = el número debe salir entre las 10 primeras
          posiciones del extracto oficial; 20 = puede salir en cualquier posición del extracto (00-99).
        </div>

        {stats && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "#e7e5e4",
              background: "rgba(250,204,21,.08)",
              borderRadius: 8,
              padding: "6px 8px",
              lineHeight: 1.6,
            }}
          >
            <b>Rendimiento histórico real</b> ({stats.muestra} sorteos · {stats.desde} → {stats.hasta}):{" "}
            sorteos con <b>al menos 1 de 5</b> completa = <b>{stats.alMenos1.toFixed(1)}%</b> ·{" "}
            con <b>al menos 2</b> = <b>{stats.alMenos2.toFixed(1)}%</b> ·{" "}
            con <b>al menos 3</b> = <b>{stats.alMenos3.toFixed(1)}%</b>.
          </div>
        )}
        {statsError && (
          <p style={{ color: "#fbbf24", fontSize: 11, marginTop: 8 }}>{statsError}</p>
        )}

        <button
          onClick={guardarPlan}
          disabled={guardando === "saving"}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(250,204,21,.5)",
            background: guardando === "ok" ? "rgba(34,197,94,.22)" : guardando.startsWith("err") ? "rgba(239,68,68,.18)" : guardando === "duplicado" ? "rgba(56,189,248,.18)" : "rgba(250,204,21,.22)",
            color: guardando === "ok" ? "#4ade80" : guardando.startsWith("err") ? "#f87171" : guardando === "duplicado" ? "#7dd3fc" : "#fde047",
            fontWeight: 800,
            fontSize: 12,
            cursor: guardando === "saving" ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {guardando === "saving" && "Guardando las 5 jugadas…"}
          {guardando === "ok" && "✓ 5 jugadas guardadas — se verifican solas con el resultado oficial"}
          {guardando === "duplicado" && "Ya guardaste un análisis para este turno hoy"}
          {guardando === "err" && `No se pudo guardar: ${errorGuardado ?? "error"}`}
          {guardando === "idle" && "💾 Guardar las 5 jugadas (Premium)"}
        </button>
        <p style={{ color: "#64748b", margin: "6px 0 0", fontSize: 10, lineHeight: 1.5 }}>
          Se guarda como una predicción del turno con las 5 redoblonas; el verificador automático marca aciertos
          (criterio interno: par presente en los 20 números del extracto) al publicarse el sorteo.
        </p>

        <p style={{ color: "#64748b", margin: "8px 0 0", fontSize: 10, lineHeight: 1.5 }}>
          Referencia azar P(ambos) ≈ {AZAR_CONJUNTA.toFixed(2)}% por par. Criterio interno del plan (ordenación por las 4
          primeras posiciones de 2 cifras del motor) — no equivale a la Redoblona Exacta oficial (1° y 2° en orden, 3500×) ni
          a la Redoblona por Extensión. No hay ventaja demostrada sobre el azar: cualquier jugada gana o pierde por
          probabilidad pura. Jugar con responsabilidad.
        </p>
      </div>
    </div>
  )
}
