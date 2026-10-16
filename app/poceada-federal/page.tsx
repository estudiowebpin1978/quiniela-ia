"use client"

/**
 * Poceada Federal (Lotería de Santa Fe) — modalidad PREMIUM con las
 * MISMAS instrucciones/estructura de la Poceada de la Ciudad (misma
 * estética: brinco.css, brinco-head / brinco-card),
 * pero con las reglas oficiales de la Poceada Federal.
 *
 * La página es visible para cualquier usuario logueado: las acciones
 * premium NO se rotulan como tales; al seleccionarlas aparece una leyenda
 * "Esta opción es de acceso premium". El servidor REVALIDA el tier
 * (resolveUserTier → canAccessPremiumFeatures) en los endpoints de análisis,
 * por lo que la leyenda no relaja la seguridad.
 *
 * Análisis experimental (secciones 5/6 del requerimiento): al pedir un
 * análisis nuevo, el servidor sincroniza resultados oficiales (IAFAS +
 * extracto HTML de Lotería de Santa Fe), recalcula el motor sobre TODO el
 * historial validado, genera 5 combinaciones de 8 números con backtesting
 * walk-forward y guarda una instantánea auditable ANTES del sorteo objetivo.
 * Si la sincronización falla, se usa el último historial validado y se avisa
 * explícitamente (nunca se afirman datos frescos que no se recuperaron).
 *
 * Honestidad: las combinaciones son "selecciones heurísticas basadas en el
 * historial, sin ventaja demostrada" salvo que el backtest lo demuestre con
 * evidencia estadística. La probabilidad matemática de cada jugada (8 sobre
 * un extracto de 20/100) NO depende del modelo.
 */

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getAuth } from "@/lib/auth"
import "../brinco/brinco.css"

const fmtNums = (nums: number[]) =>
  [...nums].sort((a, b) => a - b).map((n) => String(n).padStart(2, "0"))

const pct = (p: number) => `${(p * 100).toFixed(4)}%`

const NOMBRES_ESTRATEGIA: Record<string, string> = {
  "1-frecuencia-historica": "1 · Frecuencias históricas regularizadas",
  "2-frecuencia-reciente": "2 · Frecuencia reciente ponderada",
  "3-tendencias-validadas": "3 · Tendencias validadas fuera de muestra",
  "4-combinado-coocurrencias": "4 · Combinado frecuencia+recencia con coocurrencias",
  "5-ensemble-oos": "5 · Ensemble por desempeño fuera de muestra",
}

interface Jugada {
  orden: number
  estrategia: string
  numeros: number[]
}

interface Analisis {
  sincronizacion: { ok: boolean; datosNuevos?: boolean; detalle?: string }
  historial: {
    cantidad: number
    desde: string
    hasta: string
    huella: string
    antiguedadUltimoDias?: number
  }
  jugadas: Jugada[]
  etiqueta: string
  ventajaDemostrada: boolean | null
  probabilidadesTeoricas: {
    alMenos6: number
    alMenos7: number
    alMenos8: number
    exactamente8: number
    nota: string
  }
  advertencias: string[]
  backtest: {
    estado: string
    muestra: { evaluaciones: number; desde: string; hasta: string; trainInicial: number; paso: number }
    modelo: {
      promedioGeneral: number
      maximoPromedio: number
      promedioPorJugada: number[]
      conteosMayoresIgual: { g6: number; g7: number; g8: number }
      proporciones: { g6: number; g7: number; g8: number }
    }
    azar: {
      promedioGeneral: number
      maximoPromedio: number
      promedioPorJugada: number[]
      conteosMayoresIgual: { g6: number; g7: number; g8: number }
      proporciones: { g6: number; g7: number; g8: number }
    }
    diferencia: { promedioGeneral: number; intervalo95: [number, number]; errorEstandar: number; ventajaDemostrada: boolean }
    interpretacion: string
  }
  objetivo: { confirmado: boolean; concurso?: number; fecha?: string; nota?: string }
  prediccionId: string | null
  generadoEn: string
  version: string
}

/** Instantánea guardada (append-only) y su evaluación vs el sorteo oficial. */
interface PredGuardada {
  id: string
  generado_en: string
  historial_huella: string
  historial_corte_fecha: string
  sorteo_objetivo_concurso: number | null
  sorteo_objetivo_confirmado: boolean
  estado: "pendiente" | "evaluada" | "no_evaluable"
  combinaciones: unknown[]
  evaluacion: {
    concursoEvaluado?: number
    fechaEvaluada?: string
    numerosOficiales?: number[]
    aciertosPorJugada?: number[]
    maximo?: number
    motivo?: string
  } | null
}

const filaMetrica = (a: string, b: string | number, c?: string | number) => (
  <tr key={a}>
    <td style={{ padding: "4px 8px 4px 0", color: "var(--text-dim,#9aa0a6)" }}>{a}</td>
    <td style={{ padding: "4px 8px 4px 0", fontWeight: 600 }}>{b}</td>
    {c !== undefined && <td style={{ padding: "4px 0" }}>{c}</td>}
  </tr>
)

export default function PoceadaFederalPage() {
  const router = useRouter()
  const [cargando, setCargando] = useState(true)
  const [acceso, setAcceso] = useState<"cargando" | "ok" | "no-auth">("cargando")
  const [esPremium, setEsPremium] = useState(false)
  const [leyendaPremium, setLeyendaPremium] = useState(false)
  const [analizando, setAnalizando] = useState(false)
  const [analisis, setAnalisis] = useState<Analisis | null>(null)
  const [errorAnalisis, setErrorAnalisis] = useState<string | null>(null)
  const [guardadas, setGuardadas] = useState<PredGuardada[]>([])
  const [guardadoRecien, setGuardadoRecien] = useState(false)
  // ¿El historial cambió desde la última registrada? (explica jugadas iguales)
  const [estadoHistorial, setEstadoHistorial] = useState<
    "sin-previa" | "nuevo" | "sin-cambios" | null
  >(null)

  // Lista las jugadas guardadas (premium): el servidor evalúa en el GET las
  // pendientes contra los resultados oficiales ya validados (verificación).
  const cargarGuardadas = useCallback(async () => {
    const tk = getAuth()?.access_token
    if (!tk) return
    try {
      const r = await fetch("/api/poceada-federal/combinaciones", {
        headers: { Authorization: "Bearer " + tk },
      })
      if (!r.ok) return
      const d = await r.json().catch(() => null)
      if (d?.ok && Array.isArray(d.predicciones)) setGuardadas(d.predicciones as PredGuardada[])
    } catch {}
  }, [])

  // Acceso Premium en el CLIENTE (mismo patrón que Brinco/Poceada):
  // getAuth() -> /api/auth/me -> canAccessPremiumFeatures | role premium/admin.
  // El estado se resuelve SIEMPRE en callbacks (nunca setState síncrono en el
  // cuerpo del effect — regla react-hooks/set-state-in-effect).
  useEffect(() => {
    const tk = getAuth()?.access_token
    Promise.resolve()
      .then(() => {
        if (!tk) return null
        return fetch("/api/auth/me", { headers: { Authorization: "Bearer " + tk } }).then((r) =>
          r.ok ? r.json() : null
        )
      })
      .then((me) => {
        if (!tk) {
          setAcceso("no-auth")
          return
        }
        const premium = me?.canAccessPremiumFeatures || me?.role === "premium" || me?.role === "admin"
        setEsPremium(Boolean(premium))
        setAcceso("ok")
      })
      .catch(() => setAcceso("no-auth"))
      .finally(() => setCargando(false))
    void cargarGuardadas()
  }, [cargarGuardadas])

  // Solicita un análisis nuevo: el servidor sincroniza resultados oficiales,
  // recalcula sobre TODO el historial validado, genera las 5 combinaciones,
  // corre el backtest y guarda la instantánea pre-sorteo (sección 6).
  const generarAnalisis = async () => {
    if (!esPremium) {
      setLeyendaPremium(true)
      return
    }
    setAnalizando(true)
    setErrorAnalisis(null)
    setGuardadoRecien(false)
    setEstadoHistorial(null)
    try {
      const tk = getAuth()?.access_token || ""
      const r = await fetch("/api/poceada-federal/combinaciones", {
        method: "POST",
        headers: { Authorization: "Bearer " + tk },
      })
      const d = await r.json().catch(() => null)
      if (r.status === 401) {
        setErrorAnalisis("Sesión requerida: iniciá sesión de nuevo.")
        return
      }
      if (r.status === 403) {
        setLeyendaPremium(true)
        return
      }
      if (r.status === 503) {
        if (d?.error === "sin_historial_validado") setErrorAnalisis(d.detalle)
        else if (d?.error === "migracion_pendiente")
          setErrorAnalisis(
            "La migración del módulo todavía no está aplicada en Supabase (20261015060000_poceada_federal_module.sql)."
          )
        else setErrorAnalisis(d?.detalle || "Servicio no disponible.")
        return
      }
      if (!r.ok || !d?.ok) {
        setErrorAnalisis(d?.detalle || "No se pudo generar el análisis.")
        return
      }
      setAnalisis(d as Analisis)
      // Comparación con la ÚLTIMA registrada (antes de refrescar la lista):
      // el generador es determinista — si la huella del historial no cambió,
      // las jugadas coinciden y se explica explícitamente.
      const huellaPrevia = guardadas[0]?.historial_huella
      setEstadoHistorial(
        !huellaPrevia ? "sin-previa" : huellaPrevia === d.historial?.huella ? "sin-cambios" : "nuevo"
      )
      if (d.prediccionId) {
        setGuardadoRecien(true)
        void cargarGuardadas()
      }
    } catch (e) {
      setErrorAnalisis(`Error de red: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setAnalizando(false)
    }
  }

  if (cargando || acceso === "cargando") {
    return (
      <div className="brinco-wrap accent-sky">
        <div className="brinco-loading">Cargando Poceada Federal…</div>
      </div>
    )
  }

  if (acceso === "no-auth") {
    return (
      <div className="brinco-wrap brinco-gate accent-sky">
        <h2>Poceada Federal</h2>
        <p className="brinco-empty">Iniciá sesión para acceder.</p>
        <div className="brinco-actions" style={{ justifyContent: "center" }}>
          <button className="brinco-btn" onClick={() => router.push("/login")}>
            Iniciar sesión
          </button>
          <button className="brinco-btn ghost" onClick={() => router.push("/predictions")}>
            ← Volver a Quiniela
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="brinco-wrap accent-sky">
      <div className="brinco-head">
        <h1 className="brinco-title">Poceada Federal</h1>
        <button
          className="brinco-btn ghost"
          style={{ marginLeft: "auto", alignSelf: "center" }}
          onClick={() => router.push("/predictions")}
        >
          ← Volver a Quiniela
        </button>
      </div>

      <div className="brinco-card">
        <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 8 }}>
          🎯 Jugadas sugeridas
        </div>
        <button className="brinco-btn" onClick={generarAnalisis} disabled={analizando}>
          {analizando ? "Generando análisis…" : "Generar nuevo análisis"}
        </button>
        {errorAnalisis && (
          <p style={{ color: "#e05252", fontSize: "0.85rem", margin: "8px 0 0" }}>{errorAnalisis}</p>
        )}
        {guardadoRecien && (
          <p style={{ color: "#22c55e", fontSize: "0.82rem", margin: "8px 0 0", fontWeight: 700 }}>
            💾 Jugada registrada antes del sorteo — se verifica con el resultado oficial.
          </p>
        )}
        {leyendaPremium && (
          <div className="brinco-card brinco-empty" style={{ marginTop: 10 }}>
            Esta opción es de acceso premium. Actualizá tu plan para generar el análisis.
            <div style={{ marginTop: 10 }}>
              <button className="brinco-btn" onClick={() => router.push("/predictions")}>
                Ver planes
              </button>
            </div>
          </div>
        )}

        {analisis && (
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <div className="brinco-meta" style={{ display: "block", borderRadius: 8 }}>
              <b>📚 Historial:</b> {analisis.historial.cantidad} sorteos · {analisis.historial.desde} →{" "}
              {analisis.historial.hasta}
              {analisis.historial.antiguedadUltimoDias
                ? ` · último hace ${analisis.historial.antiguedadUltimoDias} día(s)`
                : ""}
              {estadoHistorial === "nuevo" && (
                <span style={{ color: "#22c55e" }}>
                  {" "}
                  · ✅ nuevo desde la última registrada
                </span>
              )}
              {estadoHistorial === "sin-cambios" && (
                <span style={{ color: "#7dd3fc" }}>
                  {" "}
                  · sin cambios desde la última registrada (por eso las jugadas coinciden)
                </span>
              )}
              <br />
              <b>Sorteo objetivo:</b>{" "}
              {analisis.objetivo.confirmado
                ? `concurso ${analisis.objetivo.concurso} del ${analisis.objetivo.fecha} (confirmado en la fuente oficial)`
                : `NO confirmado — ${analisis.objetivo.nota ?? "sin fecha oficial"}`}
              <br />
              {analisis.sincronizacion?.datosNuevos ? (
                <span style={{ color: "#22c55e" }}>
                  ✓ Historial actualizado con resultados oficiales nuevos.
                </span>
              ) : analisis.sincronizacion?.ok ? (
                <span style={{ color: "var(--text-dim,#9aa0a6)" }}>
                  ✓ Historial al día (sin resultados nuevos desde la última consulta).
                </span>
              ) : (
                <span style={{ color: "#ffc107" }}>
                  ⚠ Consulta parcial: una fuente oficial no respondió — se usó el histal validado.
                </span>
              )}
            </div>

            <div
              className="brinco-meta"
              style={{
                display: "block",
                borderRadius: 8,
                border: "1px solid rgba(255,193,7,.35)",
              }}
            >
              {analisis.ventajaDemostrada === null
                ? "⏳ Ventaja: pendiente de demostración"
                : analisis.ventajaDemostrada
                  ? "✅ Ventaja sobre el azar demostrada"
                  : "ℹ️ Sin ventaja demostrada — heurísticas basadas en el historial"}
            </div>

            {analisis.jugadas.map((j) => (
              <div
                key={j.orden}
                style={{
                  border: "1px solid rgba(255,255,255,.08)",
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                  {NOMBRES_ESTRATEGIA[j.estrategia] ?? j.estrategia}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    margin: "8px 0",
                    fontFamily: "ui-monospace,monospace",
                  }}
                >
                  {fmtNums(j.numeros).map((n) => (
                    <span
                      key={n}
                      style={{
                        background: "rgba(255,255,255,.08)",
                        borderRadius: 6,
                        padding: "4px 8px",
                        fontWeight: 700,
                        letterSpacing: 1,
                      }}
                    >
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            <div className="brinco-card" style={{ border: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: 6 }}>
                ⚖️ Probabilidad matemática (NO depende del modelo)
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <tbody>
                  {filaMetrica("P(≥6 aciertos)", pct(analisis.probabilidadesTeoricas.alMenos6))}
                  {filaMetrica("P(≥7 aciertos)", pct(analisis.probabilidadesTeoricas.alMenos7))}
                  {filaMetrica("P(8 aciertos)", pct(analisis.probabilidadesTeoricas.alMenos8))}
                  {filaMetrica("P(8 exactos)", pct(analisis.probabilidadesTeoricas.exactamente8))}
                </tbody>
              </table>
              <p style={{ margin: "8px 0 0", fontSize: "0.75rem", color: "var(--text-dim,#9aa0a6)" }}>
                Probabilidades de una jugada al azar (hipergeométrica)
              </p>
            </div>

            <div className="brinco-card" style={{ border: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: 6 }}>
                📈 Rendimiento histórico (walk-forward vs azar)
              </div>
              <div style={{ display: "grid", gap: 4, fontSize: "0.78rem", color: "var(--text-dim,#9aa0a6)" }}>
                {analisis.backtest.muestra.evaluaciones > 0 ? (
                  <>
                    <div>Muestra: {analisis.backtest.muestra.evaluaciones} sorteos · {analisis.backtest.muestra.desde} → {analisis.backtest.muestra.hasta} · estado {analisis.backtest.estado}</div>
                    <div>≥6 aciertos: {pct(analisis.backtest.modelo.proporciones.g6)} vs azar {pct(analisis.backtest.azar.proporciones.g6)} · ≥7: {pct(analisis.backtest.modelo.proporciones.g7)} vs {pct(analisis.backtest.azar.proporciones.g7)} · ≥8: {pct(analisis.backtest.modelo.proporciones.g8)} vs {pct(analisis.backtest.azar.proporciones.g8)}</div>
                    <div>
                      Dif. modelo − azar: <b>{analisis.backtest.diferencia.promedioGeneral >= 0 ? "+" : ""}{analisis.backtest.diferencia.promedioGeneral.toFixed(4)}</b> · IC 95% [{analisis.backtest.diferencia.intervalo95[0].toFixed(4)}, {analisis.backtest.diferencia.intervalo95[1].toFixed(4)}] → {analisis.backtest.diferencia.ventajaDemostrada ? "sí, ventaja demostrada (requiere confirmación)" : "sin ventaja demostrada: no distinguible del azar"}
                    </div>
                  </>
                ) : (
                  <div>Sin evaluaciones: {analisis.backtest.interpretacion}</div>
                )}
              </div>
            </div>

            <details style={{ fontSize: "0.78rem", color: "var(--text-dim,#9aa0a6)" }}>
              <summary style={{ cursor: "pointer" }}>ℹ️ Detalles técnicos</summary>
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                {analisis.advertencias.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </div>

      {esPremium && (
        <div className="brinco-card">
          <div style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 8 }}>
            💾 Guardadas · verificación oficial
          </div>
          {guardadas.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-dim,#9aa0a6)", lineHeight: 1.5 }}>
              Todavía no hay jugadas guardadas. Al generar un análisis, las 5 jugadas quedan
              registradas antes del sorteo y se verifican solas contra el resultado oficial.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
              {guardadas.map((p) => (
                <li
                  key={p.id}
                  style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: 12 }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      fontSize: "0.76rem",
                      color: "var(--text-dim,#9aa0a6)",
                    }}
                  >
                    <span>
                      💾{" "}
                      {new Date(p.generado_en).toLocaleString("es-AR", {
                        timeZone: "America/Argentina/Buenos_Aires",
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                    {p.sorteo_objetivo_confirmado && p.sorteo_objetivo_concurso != null && (
                      <span>· objetivo: concurso {p.sorteo_objetivo_concurso}</span>
                    )}
                    {p.estado === "pendiente" && (
                      <span style={{ color: "#fbbf24", fontWeight: 700 }}>
                        ⏳ Esperando el sorteo oficial
                      </span>
                    )}
                    {p.estado === "evaluada" && (
                      <span style={{ color: "#22c55e", fontWeight: 700 }}>
                        ✅ Sorteo {p.evaluacion?.concursoEvaluado} ({p.evaluacion?.fechaEvaluada}) —
                        máx {p.evaluacion?.maximo ?? "-"}/8 aciertos
                      </span>
                    )}
                    {p.estado === "no_evaluable" && (
                      <span style={{ color: "#f87171", fontWeight: 700 }}>
                        ⚠ No evaluable{p.evaluacion?.motivo ? ` — ${p.evaluacion.motivo}` : ""}
                      </span>
                    )}
                  </div>
                  {(p.evaluacion?.numerosOficiales ?? []).length > 0 && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: "0.72rem",
                        color: "var(--text-dim,#9aa0a6)",
                        fontFamily: "ui-monospace,monospace",
                      }}
                    >
                      Sorteo oficial:{" "}
                      {(p.evaluacion?.numerosOficiales ?? []).map((n) => (
                        <span
                          key={n}
                          style={{
                            display: "inline-block",
                            background: "rgba(255,255,255,.08)",
                            borderRadius: 5,
                            padding: "2px 6px",
                            margin: "2px 0 0 4px",
                            fontWeight: 700,
                          }}
                        >
                          {String(n).padStart(2, "0")}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 8, display: "grid", gap: 5 }}>
                    {(Array.isArray(p.combinaciones) ? p.combinaciones : []).map((c, i) => {
                      const nums = Array.isArray((c as { numeros?: number[] }).numeros)
                        ? (c as { numeros: number[] }).numeros
                        : []
                      const aciertosJ = p.evaluacion?.aciertosPorJugada?.[i]
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                          <span style={{ fontSize: "0.68rem", color: "var(--text-dim,#9aa0a6)", width: 46 }}>
                            J{i + 1}
                          </span>
                          {fmtNums(nums).map((n) => {
                            const hit = (p.evaluacion?.numerosOficiales ?? []).includes(Number(n))
                            return (
                              <span
                                key={n}
                                style={{
                                  background: hit ? "rgba(34,197,94,.22)" : "rgba(255,255,255,.08)",
                                  color: hit ? "#22c55e" : undefined,
                                  borderRadius: 6,
                                  padding: "3px 7px",
                                  fontWeight: 700,
                                  fontFamily: "ui-monospace,monospace",
                                  fontSize: "0.78rem",
                                }}
                              >
                                {n}
                              </span>
                            )
                          })}
                          {aciertosJ !== undefined && (
                            <span
                              style={{
                                marginLeft: "auto",
                                fontSize: "0.75rem",
                                fontWeight: 800,
                                color: aciertosJ >= 6 ? "#22c55e" : "var(--text-dim,#9aa0a6)",
                              }}
                            >
                              {aciertosJ}/8
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
