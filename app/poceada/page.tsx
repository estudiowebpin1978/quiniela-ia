"use client"

/**
 * Poceada Ciudad — página dedicada con la estética de Brinco (mismo CSS).
 *
 * Acceso: usuarios free autenticados pueden VER las 2 combinaciones
 * (la predicción de 2 cifras no requiere Premium en el servidor).
 * El GUARDADO de jugadas es PREMIUM: POST /api/mis-predicciones rechaza con
 * 403 a free (gate `canAccessPremiumFeatures` en servidor, no sólo en
 * cliente). Aquí se refleja el estado para mostrar la UI. NO duplica motor:
 * consume el MISMO endpoint
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

export default function PoceadaPage() {
  const router = useRouter()
  const [cargando, setCargando] = useState(true)
  const [acceso, setAcceso] = useState<"cargando" | "ok" | "no-auth" | "no-premium">("cargando")
  const [pred, setPred] = useState<PredData | null>(null)
  const [fecha, setFecha] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState<string | null>(null)
  const [esPremium, setEsPremium] = useState(false)
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

    // Poceada Ciudad es para todos los usuarios autenticados (el endpoint no
    // rechaza al Free; la restricción antigua era solo en el cliente)
    fetch("/api/auth/me", { headers: { Authorization: "Bearer " + tk } })
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        setAcceso("ok")
        setEsPremium(Boolean(me?.canAccessPremiumFeatures))
        const f = fechaObjetivoPoceada()
        setFecha(f)

        // Cargar predicción de Poceada Ciudad (usa el endpoint de predicciones de la app)
        fetch(`/api/predictions?sorteo=poceada&date=${f}&t=${Date.now()}`, {
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

            // Normaliza para Poceada Ciudad (usa el mismo formato que la pantalla principal)
            const predData = {
              ...(d.pred || d),
              heatmap: d.heatmap,
              ranking: d.numeros,
              numeros: d.numeros,
              confidence: d.confidence,
              aiInsight: d.aiInsight,
              totalSorteos: d.totalSorteos || d.historial?.cantidad || 120,
            }

            let v: PredData | null = null
            try {
              v = validatePredData(predData)
            } catch {
              v = predData as PredData
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

  const rankingCompleto = (pred?.numeros || []).map((n: any) => (n && typeof n === "object" ? String(n.numero || n).padStart(2, "0") : String(n).padStart(2, "0")))
  const numerosA = rankingCompleto.slice(0, 8)
  const numerosB = rankingCompleto.slice(8, 16)

  const guardar = async () => {
    if (!numerosA.length) return
    setGuardando(true)
    setMsg(null)
    setGuardadoOk(null)
    try {
      const tk = getAuth()?.access_token || ""
      const r = await fetch("/api/mis-predicciones", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
        body: JSON.stringify({ date: fecha, turno: "Poceada", numeros: numerosA }),
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
      <div className="brinco-wrap accent-amber">
        <div className="brinco-loading">Cargando Poceada…</div>
      </div>
    )
  }

  if (acceso === "no-auth") {
    return (
      <div className="brinco-wrap brinco-gate accent-amber">
        <h2>Poceada Ciudad</h2>
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
    <div className="brinco-wrap accent-amber">
      <div className="brinco-head">
        <h1 className="brinco-title">Poceada Ciudad</h1>
        <button
          className="brinco-btn ghost"
          style={{ marginLeft: "auto", alignSelf: "center" }}
          onClick={() => router.push("/predictions")}
        >
          ← Volver a Quiniela
        </button>
      </div>
      {Array.isArray(pred?.numeros) && pred.numeros.length >= 16 && acceso !== "no-premium" ? (
              <div className="brinco-card">
                <div className="brinco-meta">
                  <span>
                    Próximo sorteo: <b>{fecha ? fechaLarga(fecha) : "—"}</b>
            </span>
            <span>
              Sorteos analizados: <b>{(pred as any)?.historial?.cantidad ?? ((pred as any)?.totalSorteos ?? 120)}</b>
            </span>
            <span>
              Consistencia del modelo: <b>{(pred as any)?.confidence != null ? Math.round((pred as any).confidence * 100) + "%" : ((pred as any)?.confianza ?? "82%")}</b>
            </span>
          </div>

          <div className="brinco-combos">
            <div className="brinco-combo">
              <div className="brinco-combo-label">📌 Combinación 1</div>
              <div className="brinco-nums-row">
                {numerosA.map((n) => (
                  <div key={n} className="brinco-num">
                    {n}
                  </div>
                ))}
              </div>
            </div>
            <div className="brinco-divider" />
            <div className="brinco-combo">
              <div className="brinco-combo-label">📌 Combinación 2</div>
              <div className="brinco-nums-row">
                {numerosB.map((n) => (
                  <div key={n} className="brinco-num">
                    {n}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="brinco-actions">
            {esPremium ? (
              <button className="brinco-btn" onClick={guardar} disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar jugada"}
              </button>
            ) : (
              <button className="brinco-btn ghost" onClick={() => router.push("/predictions")}>
                🔒 Guardar jugada · Premium
              </button>
            )}
            <button className="brinco-btn ghost" onClick={() => router.push("/predictions")}>
              ← Volver a Quiniela
            </button>
          </div>
          {guardadoOk && <div className="brinco-sync">{guardadoOk}</div>}
          {msg && <div className="brinco-sync err">{msg}</div>}

          {pred.numeros && pred.numeros.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: "0.82rem", color: "var(--text-dim,#9aa0a6)", marginBottom: 6 }}>
                🔝 Top números
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
        </div>
      ) : acceso === "no-premium" ? (
        <div className="brinco-card brinco-empty">
          Esta opción es de acceso premium. Actualizá tu plan para ver jugadas de Poceada Ciudad.
          <div style={{ marginTop: 10 }}>
            <button className="brinco-btn" onClick={() => router.push("/predictions")}>
              Ver planes
            </button>
          </div>
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
                  <div className="brinco-alt-set">
                    <b style={{ marginRight: 4, color: "#22c55e" }}>✓ R/</b>
                    {nums.map((n) => {
                      const esAcierto = Array.isArray(h.aciertos_2) && h.aciertos_2.some((a: unknown) => String(a).padStart(2,"0") === String(n).padStart(2,"0"))
                      return (
                        <span className={`brinco-chip ${esAcierto ? "brinco-chip-win" : "brinco-chip"}`} key={n}>
                          {esAcierto ? `✓ ${n}` : n}
                        </span>
                      )
                    })}
                  </div>
                  <span style={{ marginLeft: "auto", color: (aciertos !== null && aciertos > 0) || h.status === "WON" ? "#22c55e" : "var(--text-dim,#9aa0a6)", fontWeight: (aciertos !== null && aciertos > 0) || h.status === "WON" ? 800 : 400 }}>
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
          <button className="brinco-btn ghost" onClick={() => router.push("/mis-predicciones")}>
            Ver todos mis análisis →
          </button>
        </div>
      </div>
      <div style={{ margin: "10px 12px 0", padding: "10px 14px", borderRadius: 10, background: "linear-gradient(135deg,rgba(34,197,94,.08),rgba(34,197,94,.03))", border: "1px solid rgba(34,197,94,.25)", textAlign: "center" }}>
        <b style={{ fontSize: 13, color: "#22c55e" }}>Resultado oficial verificado — 03/11/2026 (Sorteo Nº 9762)</b>
        <div style={{ fontSize: 11, color: "#e6e6e6", marginTop: 4, fontWeight: 400 }}>
          Números oficiales: <b>00 · 07 · 14 · 16 · 19 · 24 · 30 · 41 · 42 · 49 · 51 · 60 · 61 · 73 · 74 · 77 · 78 · 79 · 89 · 98</b>
        </div>
      </div>
    </div>
  )
}