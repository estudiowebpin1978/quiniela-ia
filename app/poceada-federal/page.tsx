"use client"

/**
 * Poceada Federal (Lotería de Santa Fe) — modalidad PREMIUM con las
 * MISMAS instrucciones/estructura de la Poceada de la Ciudad (misma
 * estética: brinco.css, brinco-head / brinco-sub / brinco-card / aviso),
 * pero con las reglas oficiales de la Poceada Federal.
 *
 * Acceso Premium controlado en el CLIENTE (mirando /api/auth/me, mismo
 * patrón que Brinco y Poceada) y REVALIDADO en el servidor para los
 * endpoints de análisis (resolveUserTier → canAccessPremiumFeatures).
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
 *
 * La única lógica derivada (no inventada) es la alternancia mensual del
 * sorteo nocturno, que sale del helper puro y testeado
 * lib/poceada-federal/reglas.ts.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getAuth } from "@/lib/auth"
import {
  periodoART,
  loteriaNocturnaRigente,
  nombreMes,
  etiquetaLoteriaNocturna,
} from "@/lib/poceada-federal/reglas"
import "../brinco/brinco.css"

const AVISO =
  "La lotería es un evento aleatorio e independiente y no se garantiza ningún resultado. " +
  "La Poceada Federal es un juego poceado (parimutuel): el premio depende del pozo y de " +
  "cuántos jugadores aciertan, no hay ganancia fija por juego. Jugá con responsabilidad."

const tituloPaso: React.CSSProperties = { fontWeight: 700 }

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

interface Senal {
  numero: string
  frecHist: number
  frecReciente: number
  desviacion: number
  incertidumbre: string
}

interface Jugada {
  orden: number
  estrategia: string
  numeros: number[]
  explicacion: string
  senales: Senal[]
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
  const [acceso, setAcceso] = useState<"cargando" | "ok" | "no-auth" | "no-premium">("cargando")
  const [analizando, setAnalizando] = useState(false)
  const [analisis, setAnalisis] = useState<Analisis | null>(null)
  const [errorAnalisis, setErrorAnalisis] = useState<string | null>(null)
  const [senalesDe, setSenalesDe] = useState<number | null>(null)
  const { mes, anio } = periodoART()
  const rigente = loteriaNocturnaRigente(mes)

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
        setAcceso(premium ? "ok" : "no-premium")
      })
      .catch(() => setAcceso("no-auth"))
      .finally(() => setCargando(false))
  }, [])

  // Solicita un análisis nuevo: el servidor sincroniza resultados oficiales,
  // recalcula sobre TODO el historial validado, genera las 5 combinaciones,
  // corre el backtest y guarda la instantánea pre-sorteo (sección 6).
  const generarAnalisis = async () => {
    setAnalizando(true)
    setErrorAnalisis(null)
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
        setErrorAnalisis("Este análisis requiere plan Premium.")
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
    } catch (e) {
      setErrorAnalisis(`Error de red: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setAnalizando(false)
    }
  }

  if (cargando || acceso === "cargando") {
    return (
      <div className="brinco-wrap">
        <div className="brinco-loading">Cargando Poceada Federal…</div>
      </div>
    )
  }

  if (acceso === "no-auth") {
    return (
      <div className="brinco-wrap brinco-gate">
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

  if (acceso === "no-premium") {
    return (
      <div className="brinco-wrap brinco-gate">
        <h2>Poceada Federal</h2>
        <p className="brinco-empty">
          Esta modalidad es parte de Premium. Actualizá tu plan para ver la Poceada Federal.
        </p>
        <button className="brinco-btn" onClick={() => router.push("/predictions")}>
          Ver planes
        </button>
      </div>
    )
  }

  return (
    <div className="brinco-wrap">
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

      <p className="brinco-sub">
        <b>8 números</b> distintos del <b>00 al 99</b>. Se juega de <b>lunes a sábados</b> con{" "}
        <b>dos sorteos diarios</b> (matutino y nocturno) y ganás con <b>6, 7 u 8 aciertos</b>.
      </p>

      <div className="brinco-card">
        <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 8 }}>
          Cómo se juega y cómo se gana
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 10, fontSize: "0.85rem", lineHeight: 1.55 }}>
          <li>
            <span style={tituloPaso}>La elección de números.</span> Seleccionás{" "}
            <b>8 números del 00 al 99</b> (podés elegirlos vos o mediante selección automática en la
            agencia).
          </li>
          <li>
            <span style={tituloPaso}>Los sorteos.</span> Se juega de <b>lunes a sábados</b> con dos
            sorteos diarios: <b>matutino</b> y <b>nocturno</b>.
          </li>
          <li>
            <span style={tituloPaso}>Qué lotería rige el nocturno.</span> El sorteo nocturno se
            alterna según el mes: en los <b>meses impares</b> se utiliza la{" "}
            <b>Quiniela Nocturna de Santa Fe</b>; en los <b>meses pares</b>, la{" "}
            <b>Tómbola / Quiniela Nocturna de Entre Ríos</b>.
            <div
              className="brinco-meta"
              style={{ marginTop: 6, display: "block", borderRadius: 8 }}
            >
              📅 Este mes ({nombreMes(mes)} de {anio} → mes {mes % 2 === 1 ? "impar" : "par"}) el
              nocturno lo rige: <b>{etiquetaLoteriaNocturna(rigente)}</b>
            </div>
          </li>
          <li>
            <span style={tituloPaso}>Extracción.</span> Se toman las <b>2 últimas cifras</b> de los{" "}
            <b>20 premios</b> del sorteo de quiniela correspondiente. Si hay números repetidos, se
            realizan extracciones adicionales hasta completar <b>20 números distintos</b>.
          </li>
        </ol>
      </div>

      <div className="brinco-card">
        <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 8 }}>
          Niveles de premios (juego poceado)
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-dim,#9aa0a6)" }}>
              <th style={{ padding: "4px 0", fontWeight: 600 }}>Aciertos</th>
              <th style={{ padding: "4px 0", fontWeight: 600 }}>Premio</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <b>8</b> (1er premio)
              </td>
              <td style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <b>50%</b> del pozo destinado a premios (o se acumula si no hay ganadores)
              </td>
            </tr>
            <tr>
              <td style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <b>7</b> (2do premio)
              </td>
              <td style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <b>30%</b> del pozo
              </td>
            </tr>
            <tr>
              <td style={{ padding: "6px 0" }}>
                <b>6</b> (3er premio)
              </td>
              <td style={{ padding: "6px 0" }}>
                <b>20%</b> del pozo
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="brinco-card">
        <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 8 }}>Dónde jugar</div>
        <p style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.55 }}>
          Acercate a cualquier <b>agencia oficial de la Lotería de Santa Fe</b> autorizada y
          solicitá una jugada de Poceada Federal.
        </p>
      </div>

      <div className="brinco-card">
        <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 8 }}>
          Combinaciones con backtesting (experimental)
        </div>
        <p style={{ margin: "0 0 10px", fontSize: "0.85rem", lineHeight: 1.55, color: "var(--text-dim,#9aa0a6)" }}>
          Al pedir un análisis, el servidor consulta si hay <b>resultados oficiales nuevos</b>{" "}
          (IAFAS + extractos de Lotería de Santa Fe), importa y valida los registros disponibles,
          recalcula el motor sobre <b>todo el historial validado</b>, genera <b>5 combinaciones</b>{" "}
          de 8 números con <b>backtesting walk-forward</b> contra un baseline aleatorio y guarda
          una <b>instantánea auditable antes del sorteo objetivo</b>. Si la sincronización falla,
          se usa el último historial validado y se muestra su antigüedad.
        </p>
        <button className="brinco-btn" onClick={generarAnalisis} disabled={analizando}>
          {analizando ? "Generando análisis…" : "Generar nuevo análisis"}
        </button>
        {errorAnalisis && (
          <p style={{ color: "#e05252", fontSize: "0.85rem", margin: "8px 0 0" }}>{errorAnalisis}</p>
        )}

        {analisis && (
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <div className="brinco-meta" style={{ display: "block", borderRadius: 8 }}>
              📊 <b>Historial validado:</b> {analisis.historial.cantidad} sorteos (
              {analisis.historial.desde} → {analisis.historial.hasta}) · huella{" "}
              <code>{analisis.historial.huella}</code>
              {analisis.historial.antiguedadUltimoDias !== undefined &&
                ` · último resultado: hace ${analisis.historial.antiguedadUltimoDias} día(s)`}
              <br />
              <b>Sincronización:</b>{" "}
              {analisis.sincronizacion.ok
                ? analisis.sincronizacion.datosNuevos
                  ? "✓ se incorporaron resultados nuevos"
                  : "sin resultados nuevos (ya estaban importados)"
                : `⚠ falló — se usó el último historial validado: ${analisis.sincronizacion.detalle ?? "sin detalle"}`}
              <br />
              <b>Sorteo objetivo:</b>{" "}
              {analisis.objetivo.confirmado
                ? `concurso ${analisis.objetivo.concurso} del ${analisis.objetivo.fecha} (confirmado en la fuente oficial)`
                : `NO confirmado — ${analisis.objetivo.nota ?? "sin fecha oficial"}`}
              <br />
              <b>Snapshot:</b> registrada {new Date(analisis.generadoEn).toLocaleString("es-AR")}
              {analisis.prediccionId
                ? ` · id ${analisis.prediccionId} (append-only)`
                : " · no persistida (migración pendiente)"}
            </div>

            <div
              className="brinco-meta"
              style={{
                display: "block",
                borderRadius: 8,
                border: "1px solid rgba(255,193,7,.35)",
              }}
            >
              <b>{analisis.etiqueta}</b>
              <br />
              Ventaja sobre el azar demostrada:{" "}
              <b>
                {analisis.ventajaDemostrada === null
                  ? "pendiente (se concluye con el backtest)"
                  : analisis.ventajaDemostrada
                    ? "sí, con evidencia estadística en muestra"
                    : "NO"}
              </b>
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
                <p style={{ margin: 0, fontSize: "0.8rem", lineHeight: 1.5, color: "var(--text-dim,#9aa0a6)" }}>
                  {j.explicacion}
                </p>
                <button
                  className="brinco-btn ghost"
                  style={{ marginTop: 6, fontSize: "0.75rem", padding: "4px 8px" }}
                  onClick={() => setSenalesDe(senalesDe === j.orden ? null : j.orden)}
                >
                  {senalesDe === j.orden ? "ocultar señales" : "ver señales por número"}
                </button>
                {senalesDe === j.orden && (
                  <table
                    style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", marginTop: 6 }}
                  >
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--text-dim,#9aa0a6)" }}>
                        <th style={{ padding: "3px 6px 3px 0" }}>Nº</th>
                        <th style={{ padding: "3px 6px" }}>Frec. histórica</th>
                        <th style={{ padding: "3px 6px" }}>Frec. reciente</th>
                        <th style={{ padding: "3px 6px" }}>Δ vs 20%</th>
                        <th style={{ padding: "3px 0" }}>Incertidumbre</th>
                      </tr>
                    </thead>
                    <tbody>
                      {j.senales.map((s) => (
                        <tr key={s.numero}>
                          <td style={{ padding: "3px 6px 3px 0", fontWeight: 700 }}>{s.numero}</td>
                          <td style={{ padding: "3px 6px" }}>{(s.frecHist * 100).toFixed(1)}%</td>
                          <td style={{ padding: "3px 6px" }}>{(s.frecReciente * 100).toFixed(1)}%</td>
                          <td style={{ padding: "3px 6px" }}>
                            {s.desviacion >= 0 ? "+" : ""}
                            {(s.desviacion * 100).toFixed(1)} pp
                          </td>
                          <td style={{ padding: "3px 0" }}>{s.incertidumbre}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
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
                {analisis.probabilidadesTeoricas.nota}
              </p>
            </div>

            <div className="brinco-card" style={{ border: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: 6 }}>
                📈 Rendimiento histórico (backtesting walk-forward vs azar)
              </div>
              <p style={{ margin: "0 0 6px", fontSize: "0.78rem", color: "var(--text-dim,#9aa0a6)" }}>
                {analisis.backtest.muestra.evaluaciones > 0 ? (
                  <>
                    {analisis.backtest.muestra.evaluaciones} sorteos evaluados · train inicial{" "}
                    {analisis.backtest.muestra.trainInicial} · paso {analisis.backtest.muestra.paso} ·
                    período {analisis.backtest.muestra.desde} → {analisis.backtest.muestra.hasta} ·
                    estado: <b>{analisis.backtest.estado}</b>
                  </>
                ) : (
                  <>Backtest sin evaluaciones: {analisis.backtest.interpretacion}</>
                )}
              </p>
              {analisis.backtest.muestra.evaluaciones > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-dim,#9aa0a6)" }}>
                      <th style={{ padding: "3px 6px 3px 0" }}>Métrica</th>
                      <th style={{ padding: "3px 6px" }}>Modelo</th>
                      <th style={{ padding: "3px 0" }}>Azar (5 jugadas)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: "4px 6px 4px 0" }}>Promedio de aciertos por jugada</td>
                      <td style={{ padding: "4px 6px", fontWeight: 700 }}>
                        {analisis.backtest.modelo.promedioGeneral.toFixed(3)}
                      </td>
                      <td style={{ padding: "4px 0" }}>
                        {analisis.backtest.azar.promedioGeneral.toFixed(3)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "4px 6px 4px 0" }}>Máximo (entre las 5) · promedio</td>
                      <td style={{ padding: "4px 6px" }}>
                        {analisis.backtest.modelo.maximoPromedio.toFixed(2)}
                      </td>
                      <td style={{ padding: "4px 0" }}>
                        {analisis.backtest.azar.maximoPromedio.toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "4px 6px 4px 0" }}>Sorteos con ≥6 aciertos (n·prop.)</td>
                      <td style={{ padding: "4px 6px" }}>
                        {analisis.backtest.modelo.conteosMayoresIgual.g6} ·{" "}
                        {pct(analisis.backtest.modelo.proporciones.g6)}
                      </td>
                      <td style={{ padding: "4px 0" }}>
                        {analisis.backtest.azar.conteosMayoresIgual.g6} ·{" "}
                        {pct(analisis.backtest.azar.proporciones.g6)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "4px 6px 4px 0" }}>Sorteos con ≥7 aciertos</td>
                      <td style={{ padding: "4px 6px" }}>
                        {analisis.backtest.modelo.conteosMayoresIgual.g7} ·{" "}
                        {pct(analisis.backtest.modelo.proporciones.g7)}
                      </td>
                      <td style={{ padding: "4px 0" }}>
                        {analisis.backtest.azar.conteosMayoresIgual.g7} ·{" "}
                        {pct(analisis.backtest.azar.proporciones.g7)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "4px 6px 4px 0" }}>Sorteos con 8 aciertos</td>
                      <td style={{ padding: "4px 6px" }}>
                        {analisis.backtest.modelo.conteosMayoresIgual.g8} ·{" "}
                        {pct(analisis.backtest.modelo.proporciones.g8)}
                      </td>
                      <td style={{ padding: "4px 0" }}>
                        {analisis.backtest.azar.conteosMayoresIgual.g8} ·{" "}
                        {pct(analisis.backtest.azar.proporciones.g8)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
              {analisis.backtest.muestra.evaluaciones > 0 && (
                <p style={{ margin: "8px 0 0", fontSize: "0.78rem" }}>
                  Diferencia modelo − azar:{" "}
                  <b>
                    {analisis.backtest.diferencia.promedioGeneral >= 0 ? "+" : ""}
                    {analisis.backtest.diferencia.promedioGeneral.toFixed(4)}
                  </b>{" "}
                  (EE {analisis.backtest.diferencia.errorEstandar.toFixed(4)} · IC 95 % [
                  {analisis.backtest.diferencia.intervalo95[0].toFixed(4)},{" "}
                  {analisis.backtest.diferencia.intervalo95[1].toFixed(4)}]) →{" "}
                  {analisis.backtest.diferencia.ventajaDemostrada
                    ? "distinguible del azar en muestra (requiere confirmación con datos nuevos)"
                    : "NO distinguible del azar: sin ventaja demostrada"}
                  <br />
                  <span style={{ color: "var(--text-dim,#9aa0a6)" }}>
                    {analisis.backtest.interpretacion}
                  </span>
                </p>
              )}
            </div>

            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.78rem", color: "var(--text-dim,#9aa0a6)", display: "grid", gap: 4 }}>
              {analisis.advertencias.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="brinco-aviso">{AVISO}</div>
      </div>
    </div>
  )
}
