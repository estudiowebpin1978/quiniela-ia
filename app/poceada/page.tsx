"use client"

/**
 * Poceada Premium — página dedicada con la estética de Brinco (mismo CSS).
 *
 * Acceso Premium controlado en el CLIENTE (mirando /api/auth/me) y en el
 * SERVIDOR (/api/predictions rechaza a usuarios Free). Aquí se refleja el
 * estado para mostrar la UI. NO duplica motor: consume el MISMO endpoint
 * de predicciones de la app (/api/predictions?sorteo=poceada) con la misma
 * fecha objetivo que la pantalla principal, valida con validatePredData y
 * guarda con los endpoints existentes (/api/mis-predicciones). La
 * verificación de aciertos también es la existente (comparar/api-aciertos).
 *
 * Poceada es un juego SOLO de 2 cifras: 8 números de 00 a 99; el sorteo
 * extrae 20 y se gana con 5, 6, 7 u 8 aciertos (POCEADA_MATCHES). Es
 * un juego POCEADO (parimutuel): el premio depende del pozo y de cuántos
 * aciertan, no hay ganancia fija por juego.
 */

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getAuth } from "@/lib/auth"
import {
  validatePredData,
  validateMisPrediccionesResponse,
  type PredData,
  type MisPrediccion,
} from "@/lib/api/predictions"
import { fechaObjetivoPoceada, fechaLarga } from "@/lib/poceada/fechas"
import "../brinco/brinco.css"

/** La Poceada se juega con 8 números (POCEADA_NUMBERS_COUNT). */
const TOP = 8

/** Números guardados de una fila (array plano en Poceada; objeto {2,3,4} en legacy). */
function numsGuardados(p: MisPrediccion): string[] {
  const n = p.numeros
  if (Array.isArray(n)) return n
  if (n && typeof n === "object") return n["2"] || []
  return []
}

const AVISO =
  "Análisis estadístico con fines informativos: la lotería es un evento aleatorio e independiente y no se garantiza ningún resultado. " +
  "La consistencia del modelo NO es una probabilidad de acierto. La Poceada es un juego poceado (parimutuel): el premio depende del pozo y de " +
  "cuántos jugadores aciertan, no hay ganancia fija por juego. Jugá con responsabilidad."

export default function PoceadaPage() {
  const router = useRouter()
  const [cargando, setCargando] = useState(true)
  const [acceso, setAcceso] = useState<"cargando" | "ok" | "no-auth" | "no-premium">("cargando")
  const [pred, setPred] = useState<PredData | null>(null)
  const [fecha, setFecha] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState<string | null>(null)
  const [historial, setHistorial] = useState<MisPrediccion[]>([])

  const cargarHistorial = useCallback(async (tk: string) => {
    try {
      const r = await fetch("/api/mis-predicciones", { headers: { Authorization: "Bearer " + tk } })
      if (!r.ok) return
      const d = await r.json()
      const arr: unknown[] = Array.isArray(d?.predictions) ? d.predictions : []
      const poceadas = arr.filter(
        (p) => typeof p === "object" && p !== null && String((p as { turno?: string }).turno || "").toLowerCase() === "poceada"
      )
      try {
        setHistorial(validateMisPrediccionesResponse({ predictions: poceadas }).predictions)
      } catch {
        setHistorial(poceadas as MisPrediccion[])
      }
    } catch {
      /* el historial es best-effort */
    }
  }, [])

  useEffect(() => {
    const auth = getAuth()
    if (!auth?.access_token) {
      setAcceso("no-auth")
      setCargando(false)
      return
    }
    const tk = auth.access_token

    // Verificar si el usuario tiene Premium (igual que Brinco)
    fetch("/api/auth/me", { headers: { Authorization: "Bearer " + tk } })
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        const premium = me?.canAccessPremiumFeatures || me?.role === "premium" || me?.role === "admin"
        if (!premium) {
          setAcceso("no-premium")
          setCargando(false)
          return
        }
        setAcceso("ok")
        const f = fechaObjetivoPoceada()
        setFecha(f)

        // Cargar predicción (usa el motor existente)
        fetch("/api/predictions?sorteo=poceada&date=" + f + "&t=" + Date.now(), {
          headers: { Authorization: "Bearer " + tk },
        })
          .then(async (r) => {
            const d = await r.json().catch(() => ({}))
            if (r.status === 401) {
              setAcceso("no-auth")
              return
            }
            if (r.status === 403) {
              setAcceso("no-premium")
              return
            }
            if (!r.ok) throw new Error(d?.error || "Error del servidor: " + r.status)
            if (d?.error) throw new Error(d.error)

            // Normaliza el payload igual que la pantalla principal
            const predData = {
              ...(d.pred || d),
              heatmap: d.heatmap,
              ranking: d.numeros,
              numeros: d.numeros,
              confidence: d.confidence,
              aiInsight: d.aiInsight,
            }

            let v: PredData | null = null
            try {
              v = validatePredData(predData)
            } catch {
              if (Array.isArray((predData as { numeros_2?: unknown }).numeros_2)) {
                v = predData as PredData
              } else {
                throw new Error("Datos recibidos del servidor no válidos")
              }
            }
            if (!v?.numeros_2?.length && !v?.numeros?.length) {
              throw new Error("Todavía no hay predicción de Poceada para esta fecha.")
            }
            setPred(v)
          })
          .catch((e: unknown) =>
            setMsg(e instanceof Error ? e.message : "No se pudo cargar la predicción.")
          )
          .finally(() => setCargando(false))

        cargarHistorial(tk)
      })
      .catch(() => {
        setAcceso("no-auth")
        setCargando(false)
      })
  }, [cargarHistorial])

  const numeros = (
    pred?.numeros_2?.length ? pred.numeros_2 : pred?.numeros?.map((n) => n.numero) || []
  ).slice(0, TOP)

  const guardar = async () => {
    if (!numeros.length) return
    setGuardando(true)
    setMsg(null)
    setGuardadoOk(null)
    try {
      const tk = getAuth()?.access_token || ""
      const r = await fetch("/api/mis-predicciones", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
        body: JSON.stringify({ date: fecha, turno: "Poceada", numeros }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.status === 409) {
        setMsg(d?.error || "Ya guardaste un análisis para este turno.")
        return
      }
      if (r.status === 403) {
        setMsg(d?.error || "Límite de predicciones alcanzado. Actualizá el plan.")
        return
      }
      if (!r.ok) throw new Error(d?.error || "No se pudo guardar.")
      setGuardadoOk(`Guardada para el ${fechaLarga(fecha)}.`)
      cargarHistorial(tk)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error de red guardando la jugada.")
    } finally {
      setGuardando(false)
    }
  }

  if (cargando || acceso === "cargando") {
    return (
      <div className="brinco-wrap">
        <div className="brinco-loading">Cargando Poceada…</div>
      </div>
    )
  }

  if (acceso === "no-auth") {
    return (
      <div className="brinco-wrap brinco-gate">
        <h2>Poceada Premium</h2>
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
        <h2>Poceada Premium</h2>
        <p className="brinco-empty">
          Esta función es parte de Premium. Actualizá tu plan para generar jugadas de Poceada.
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
        <h1 className="brinco-title">Poceada Premium</h1>
        <button
          className="brinco-btn ghost"
          style={{ marginLeft: "auto", alignSelf: "center" }}
          onClick={() => router.push("/predictions")}
        >
          ← Volver a Quiniela
        </button>
      </div>
      <p className="brinco-sub">
        <b>8 números</b> distintos del <b>00 al 99</b>. El sorteo extrae <b>20 números</b> de lunes a
        sábado a las <b>21:00</b> (domingos y feriados no hay sorteo) y ganás con{" "}
        <b>5, 6, 7 u 8 aciertos</b>.
      </p>

      {pred && numeros.length > 0 ? (
        <div className="brinco-card">
          <div className="brinco-meta">
            <span>
              Próximo sorteo: <b>{fecha ? fechaLarga(fecha) : "—"}</b>
            </span>
            <span>
              Sorteos analizados: <b>{pred.totalSorteos ?? "—"}</b>
            </span>
            <span>
              Consistencia del modelo*: <b>{pred.confidence != null ? Math.round(pred.confidence * 100) + "%" : "—"}</b>
            </span>
          </div>

          <div className="brinco-nums">
            {numeros.map((n) => (
              <div key={n} className="brinco-num">
                {n}
              </div>
            ))}
          </div>

          <div className="brinco-actions">
            <button className="brinco-btn" onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar jugada"}
            </button>
            <button className="brinco-btn ghost" onClick={() => router.push("/predictions")}>
              ← Volver a Quiniela
            </button>
          </div>
          {guardadoOk && <div className="brinco-sync">{guardadoOk}</div>}
          {msg && <div className="brinco-sync err">{msg}</div>}

          {pred.numeros && pred.numeros.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: "0.82rem", color: "var(--text-dim,#9aa0a6)", marginBottom: 6 }}>
                Top números por score del motor (ranking 00–99):
              </div>
              <div className="brinco-scores">
                {pred.numeros.slice(0, 12).map((f) => (
                  <div className="brinco-score-row" key={f.numero}>
                    <span className="brinco-score-n">{f.numero}</span>
                    <span className="brinco-bar">
                      <span style={{ width: `${Math.round((f.score || 0) * 100)}%` }} />
                    </span>
                    <span>{Math.round((f.score || 0) * 100)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="brinco-aviso">{AVISO}</div>
        </div>
      ) : (
        <div className="brinco-card brinco-empty">{msg || "Sin datos."}</div>
      )}

      <div className="brinco-card">
        <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 4 }}>
          Mis jugadas de Poceada
        </div>
        {historial.length === 0 ? (
          <div className="brinco-empty">Todavía no guardaste jugadas de Poceada.</div>
        ) : (
          <ul className="brinco-hist">
            {historial.map((h, i) => {
              const nums = numsGuardados(h)
              const aciertos = h.aciertos_2?.length ?? null
              return (
                <li key={h.id || (h.fecha || h.date || String(i))}>
                  <b>{(h.fecha || h.date || "").split("-").reverse().join("/")}</b>
                  <span className="brinco-alt-set">
                    {nums.map((n) => (
                      <span className="brinco-chip" key={n}>
                        {n}
                      </span>
                    ))}
                  </span>
                  <span style={{ marginLeft: "auto", color: "var(--text-dim,#9aa0a6)" }}>
                    {aciertos !== null
                      ? `${aciertos} aciertos${h.status === "WON" ? " · ¡GANADA!" : ""}`
                      : "pendiente"}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <div className="brinco-actions">
          <button className="brinco-btn ghost" onClick={() => router.push("/predictions")}>
            Ver todos mis análisis →
          </button>
        </div>
      </div>
    </div>
  )
}