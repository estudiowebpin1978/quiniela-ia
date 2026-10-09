"use client"

/**
 * Brinco Premium — página del nuevo juego (6 números de 40, universo 00-39).
 *
 * Acceso Premium controlado en el SERVIDOR (/api/brinco/prediccion rechaza a
 * usuarios Free). Aquí solo se refleja el estado para mostrar la UI. Incluye
 * selector Tradicional/Junior (la misma jugada evalúa contra ambos sorteos),
 * scores explicable s, estado de sincronización y disclaimer honesto.
 */

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getAuth } from "@/lib/auth"
import "./brinco.css"

type Modalidad = "tradicional" | "junior"

interface FactoresNumero {
  numero: number
  frecuencia: number
  recencia: number
  atraso: number
  antiSplit: number
  score: number
}

interface Prediccion {
  modalidad: string
  combinacion: number[]
  combinacionFormateada: string[]
  alternativas: number[][]
  factores: FactoresNumero[]
  nHistorico: number
  datosHasta: string | null
  engineVersion: string
  aviso: string
}

interface Sincronizacion {
  sorteosTotales: number
  datosHasta: string | null
  importadosNuevos: number
  errores: number
  sinResultado: number
  fuenteDisponible: boolean
}

interface RespuestaPrediccion {
  ok: boolean
  error?: string
  aviso?: string
  concursoObjetivo?: number
  datosHasta?: string
  sorteosTotales?: number
  sincronizacion?: Sincronizacion
  tradicional?: Prediccion
  junior?: Prediccion | null
  juniorNota?: string
  upgradeRequired?: boolean
  trialExpired?: boolean
}

interface HistRow {
  id: string
  concurso_objetivo: number
  modalidad: string
  numeros: number[]
  aciertos_tradicional: number | null
  aciertos_junior: number | null
  created_at: string
}

const fmtNums = (nums: number[]) =>
  [...nums].sort((a, b) => a - b).map((n) => String(n).padStart(2, "0"))

export default function BrincoPage() {
  const router = useRouter()
  const [cargando, setCargando] = useState(true)
  const [acceso, setAcceso] = useState<"cargando" | "ok" | "no-auth" | "no-premium">("cargando")
  const [modalidad, setModalidad] = useState<Modalidad>("tradicional")
  const [data, setData] = useState<RespuestaPrediccion | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState<string | null>(null)
  const [historial, setHistorial] = useState<HistRow[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  const token = typeof window !== "undefined" ? getAuth()?.access_token || "" : ""

  const cargarHistorial = useCallback(async (tk: string) => {
    try {
      const r = await fetch("/api/brinco/historial", { headers: { Authorization: "Bearer " + tk } })
      if (r.ok) {
        const d = await r.json()
        if (d?.ok) setHistorial(d.historial || [])
      }
    } catch {}
  }, [])

  useEffect(() => {
    const auth = getAuth()
    if (!auth?.access_token) {
      setAcceso("no-auth")
      setCargando(false)
      return
    }
    const tk = auth.access_token

    fetch("/api/auth/me", { headers: { Authorization: "Bearer " + tk } })
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        const premium =
          me?.canAccessPremiumFeatures || me?.role === "premium" || me?.role === "admin"
        if (!premium) {
          setAcceso("no-premium")
          setCargando(false)
          return
        }
        setAcceso("ok")
        // Cargar predicción (con update incremental server-side).
        fetch("/api/brinco/prediccion", { headers: { Authorization: "Bearer " + tk } })
          .then((r) => r.json())
          .then((d: RespuestaPrediccion) => setData(d))
          .catch(() => setMsg("No se pudo cargar la predicción."))
          .finally(() => setCargando(false))
        cargarHistorial(tk)
      })
      .catch(() => {
        setAcceso("no-auth")
        setCargando(false)
      })
  }, [cargarHistorial])

  const guardar = async () => {
    if (!data?.concursoObjetivo) return
    const pred = modalidad === "junior" ? data.junior : data.tradicional
    if (!pred) return
    setGuardando(true)
    setMsg(null)
    setGuardadoOk(null)
    try {
      const auth = getAuth()
      const tk = auth?.access_token || ""
      const r = await fetch("/api/brinco/historial", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
        body: JSON.stringify({
          concurso_objetivo: data.concursoObjetivo,
          fecha_objetivo: null,
          modalidad,
          numeros: pred.combinacion,
          factores: { engine: pred.engineVersion },
          n_historico: pred.nHistorico,
          datos_hasta: pred.datosHasta,
        }),
      })
      const d = await r.json()
      if (d?.ok) {
        setGuardadoOk(`Guardada para el concurso ${data.concursoObjetivo} (${modalidad}).`)
        cargarHistorial(tk)
      } else {
        setMsg(d?.error || "No se pudo guardar.")
      }
    } catch {
      setMsg("Error de red guardando la predicción.")
    } finally {
      setGuardando(false)
    }
  }

  if (cargando || acceso === "cargando") {
    return (
      <div className="brinco-wrap">
        <div className="brinco-loading">Cargando Brinco…</div>
      </div>
    )
  }

  if (acceso === "no-auth") {
    return (
      <div className="brinco-wrap brinco-gate">
        <h2>Brinco Premium</h2>
        <p className="brinco-empty">Iniciá sesión para acceder.</p>
        <button className="brinco-btn" onClick={() => router.push("/login")}>
          Iniciar sesión
        </button>
      </div>
    )
  }

  if (acceso === "no-premium") {
    return (
      <div className="brinco-wrap brinco-gate">
        <h2>Brinco Premium</h2>
        <p className="brinco-empty">
          Esta función es parte de Premium. Actualizá tu plan para generar jugadas de Brinco.
        </p>
        <button className="brinco-btn" onClick={() => router.push("/predictions")}>
          Ver planes
        </button>
      </div>
    )
  }

  const pred: Prediccion | null | undefined =
    modalidad === "junior" ? data?.junior : data?.tradicional
  const sync = data?.sincronizacion

  return (
    <div className="brinco-wrap">
      <div className="brinco-head">
        <h1 className="brinco-title">Brinco Premium</h1>
      </div>
      <p className="brinco-sub">
        6 números distintos del <b>00 al 39</b>. El orden no importa. La misma jugada participa del
        sorteo <b>Tradicional</b> y del <b>Junior Siempre Sale</b>.
      </p>

      <div className="brinco-tabs">
        <button
          className={"brinco-tab" + (modalidad === "tradicional" ? " on" : "")}
          onClick={() => setModalidad("tradicional")}
        >
          Tradicional
        </button>
        <button
          className={"brinco-tab" + (modalidad === "junior" ? " on" : "")}
          disabled={!data?.junior}
          onClick={() => setModalidad("junior")}
          title={data?.junior ? "" : "Junior: historial insuficiente"}
        >
          Junior (Siempre Sale)
        </button>
      </div>

      {data && !pred && modalidad === "junior" && (
        <div className="brinco-card brinco-empty">{data.juniorNota}</div>
      )}

      {pred ? (
        <div className="brinco-card">
          <div className="brinco-meta">
            <span>
              Concurso objetivo: <b>{data?.concursoObjetivo ?? "—"}</b>
            </span>
            <span>
              Datos hasta: <b>{pred.datosHasta ?? "—"}</b>
            </span>
            <span>
              Sorteos usados: <b>{pred.nHistorico}</b>
            </span>
            <span>
              Motor: <b>{pred.engineVersion}</b>
            </span>
          </div>

          <div className="brinco-nums">
            {pred.combinacionFormateada.map((n) => (
              <div key={n} className="brinco-num">
                {n}
              </div>
            ))}
          </div>

          {pred.alternativas.length > 0 && (
            <div className="brinco-alt">
              <span>Alternativas:</span>
              {pred.alternativas.map((alt, i) => (
                <span className="brinco-alt-set" key={i}>
                  {fmtNums(alt).map((n) => (
                    <span className="brinco-chip" key={n}>
                      {n}
                    </span>
                  ))}
                </span>
              ))}
            </div>
          )}

          <div className="brinco-actions">
            <button className="brinco-btn" onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar jugada"}
            </button>
          </div>
          {guardadoOk && <div className="brinco-sync">{guardadoOk}</div>}
          {msg && <div className="brinco-sync err">{msg}</div>}

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: "0.82rem", color: "var(--text-dim,#9aa0a6)", marginBottom: 6 }}>
              Top números por score compuesto (anti‑split + recencia + frecuencia + atraso):
            </div>
            <div className="brinco-scores">
              {pred.factores.slice(0, 12).map((f) => (
                <div className="brinco-score-row" key={f.numero}>
                  <span className="brinco-score-n">{String(f.numero).padStart(2, "0")}</span>
                  <span className="brinco-bar">
                    <span style={{ width: `${Math.round(f.score * 100)}%` }} />
                  </span>
                  <span>{(f.score * 100).toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="brinco-aviso">{pred.aviso}</div>
        </div>
      ) : (
        data && <div className="brinco-card brinco-empty">{data.error || "Sin datos."}</div>
      )}

      {sync && (
        <div className="brinco-sync">
          Sincronización: {sync.sorteosTotales} sorteos cargados · últimos datos{" "}
          {sync.datosHasta || "—"}.
          {sync.errores > 0 && (
            <span className="warn">
              {" "}
              No se pudo verificar el último sorteo (fuente no disponible). Se muestran los últimos
              datos confirmados.
            </span>
          )}
        </div>
      )}

      <div className="brinco-card">
        <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 4 }}>
          Mis predicciones de Brinco
        </div>
        {historial.length === 0 ? (
          <div className="brinco-empty">Todavía no guardaste jugadas de Brinco.</div>
        ) : (
          <ul className="brinco-hist">
            {historial.map((h) => (
              <li key={h.id}>
                <b>Concurso {h.concurso_objetivo}</b>
                <span className="brinco-alt-set">
                  {fmtNums(h.numeros).map((n) => (
                    <span className="brinco-chip" key={n}>
                      {n}
                    </span>
                  ))}
                </span>
                <span style={{ color: "var(--text-dim,#9aa0a6)" }}>{h.modalidad}</span>
                <span style={{ marginLeft: "auto", color: "var(--text-dim,#9aa0a6)" }}>
                  {h.aciertos_tradicional !== null
                    ? `Tradicional: ${h.aciertos_tradicional} aciertos` +
                      (h.aciertos_junior !== null ? ` · Junior: ${h.aciertos_junior}` : "")
                    : "pendiente"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
