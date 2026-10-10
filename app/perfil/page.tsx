"use client"

/**
 * /perfil — página consolidada de usuario (responsive, mobile-first).
 *
 * Contiene: predicciones guardadas, verificación oficial de aciertos,
 * datos históricos del usuario, estado Premium/upgrade, contenido de
 * Brinco / Poceada si corresponde.
 *
 * El botón de acceso está en el nav de /predictions (reemplaza la grilla inferior).
 * Diseño práctico: columna central (~540px en móvil, ~720px en PC),
 * tipografía legible, secciones con división clara, botón de upgrade
 * prominente para usuarios Free.
 */

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { getAuth } from "@/lib/auth"
import { validateMisPrediccionesResponse, type MisPrediccion } from "@/lib/api/predictions"

export default function PerfilPage() {
  const router = useRouter()
  const [auth, setAuth] = useState<ReturnType<typeof getAuth> | null>(null)
  const [t, setT] = useState("")
  const [preds, setPreds] = useState<MisPrediccion[]>([])
  const [premium, setPremium] = useState(false)
  const [expDays, setExpDays] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"predicciones" | "verificacion" | "historial" | "premium">("predicciones")

  const cargar = useCallback(async () => {
    const a = getAuth()
    setAuth(a)
    if (!a?.access_token) { setLoading(false); return }
    setT(a.access_token)

    // Estado premium / expiración (mismo endpoint que predictions usa)
    try {
      const r = await fetch("/api/auth/me", { headers: { Authorization: "Bearer " + a.access_token } })
      if (r.ok) {
        const d = await r.json()
        const isPrem = d?.canAccessPremiumFeatures || d?.role === "premium" || d?.role === "admin"
        setPremium(isPrem)
        if (d?.premium_until) {
          const days = Math.ceil((new Date(d.premium_until).getTime() - Date.now()) / 86400000)
          setExpDays(days)
        }
      }
    } catch {}

    try {
      const r = await fetch("/api/mis-predicciones", { headers: { Authorization: "Bearer " + a.access_token } })
      if (r.ok) {
        const d = await r.json()
        const arr: unknown[] = Array.isArray(d?.predictions) ? d.predictions : []
        try {
          const val = validateMisPrediccionesResponse({ predictions: arr })
          setPreds(val.predictions)
        } catch {
          setPreds(arr as MisPrediccion[])
        }
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const tabs = [
    { id: "predicciones" as const, label: "📋 Predicciones", desc: "Jugadas guardadas con números, fechas y resultados" },
    { id: "verificacion" as const, label: "✅ Verificación", desc: "Aciertos contra sorteos oficiales (WON / NEAR / LOST)" },
    { id: "historial" as const, label: "📊 Datos Históricos", desc: "Precisión, racha, evolución de aciertos, tendencias" },
    { id: "premium" as const, label: "⭐ Premium", desc: "Estado de plan, días restantes, upgrade" },
  ]

  const predLabels: Record<string, string> = {
    previs: "Previa", primera: "Primera", matutina: "Matutina", vespertina: "Vespertina", nocturna: "Nocturna",
    poceada: "Poceada", brinco: "Brinco",
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 14px 80px", fontFamily: "'Inter',system-ui,sans-serif", color: "#e6e6e6", background: "#010101", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <button onClick={() => router.push("/predictions")} className="brinco-btn ghost" style={{ padding: "6px 10px", fontSize: 11 }}>
          ← Volver
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#f5c542", margin: 0, letterSpacing: -0.5 }}>Perfil</h1>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8", fontWeight: 700, whiteSpace: "nowrap" }}>
          {premium ? (expDays !== null ? `Premium · ${expDays} día${expDays === 1 ? "" : "s"}` : "Premium") : (auth?.access_token ? "Free" : "Invitado")}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 16px", lineHeight: 1.45 }}>
        Tu espacio de usuario: predicciones guardadas, verificación contra sorteos oficiales, datos históricos y gestión de tu plan.
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14, paddingBottom: 4 }}>
        {tabs.map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)} style={{
            flex: "0 0 auto",
            padding: "8px 12px",
            borderRadius: 10,
            border: "1.5px solid" + (tab === tb.id ? "rgba(245,197,66,.6)" : "rgba(255,255,255,.08)"),
            background: tab === tb.id ? "linear-gradient(135deg,rgba(245,197,66,.18),rgba(245,197,66,.06))" : "rgba(255,255,255,.04)",
            color: tab === tb.id ? "#f5c542" : "#cbd5e1",
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Contenido por pestaña */}
      {loading ? (
        <div style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Cargando tu perfil…</div>
      ) : (
        <>
          {tab === "predicciones" && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: "14px 0 8px", color: "#f5c542" }}>Predicciones guardadas</h2>
              {preds.length === 0 ? (
                <div style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,.03)", color: "#94a3b8", fontSize: 13, textAlign: "center" }}>
                  Todavía no guardaste ninguna predicción.<br />
                  <button onClick={() => router.push("/predictions")} style={{ marginTop: 10, padding: "8px 14px", borderRadius: 8, border: "none", background: "#f5c542", color: "#111", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    Ir a generar análisis →
                  </button>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {preds.map((p) => {
                    const nums = Array.isArray(p.numeros) ? (p.numeros as string[]) : (p.numeros?.["2"] ? (p.numeros["2"] as string[]) : [])
                    const turnoRaw = (p.turno || "").toLowerCase()
                    return (
                      <div key={p.id || p.fecha || p.date || Math.random()} style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                          <b style={{ fontSize: 13, color: "#e6e6e6" }}>{predLabels[turnoRaw] || turnoRaw} — {p.fecha || p.date || "—"}</b>
                          <span style={{ fontSize: 11, color: p.status === "WON" ? "#34d399" : p.status === "NEAR_MISS" ? "#fbbf24" : "#94a3b8", fontWeight: 700 }}>{p.status || "pendiente"}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                          {nums.map((n) => (
                            <span key={n} style={{ padding: "3px 7px", borderRadius: 8, background: "rgba(245,197,66,.12)", color: "#f5c542", fontWeight: 800, fontSize: 11 }}>{n}</span>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                          {p.aciertos?.filter((a: any) => a?.numero).length ?? 0} aciertos registrados · guardada {(p.created_at || "").slice(0, 10)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "verificacion" && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: "14px 0 8px", color: "#f5c542" }}>Verificación oficial</h2>
              <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
                Comparación automatizada con los sorteos oficiales de LOTBA / CAS. El estado es <strong style={{ color: "#f5c542" }}>WON</strong> (aciertos ≥5 para Poceada, ≥4 para Quiniela), <strong>NEAR_MISS</strong> (cerca) o <strong>LOST</strong> (sin aciertos).
              </p>
              <div style={{ display: "grid", gap: 10 }}>
                {preds.filter((p) => p.status && String(p.status) !== "pending").length === 0 ? (
                  <div style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,.03)", color: "#94a3b8", fontSize: 13, textAlign: "center" }}>
                    Todavía no hay resultados oficiales verificados. Las jugadas guardadas se comparan automáticamente tras cada sorteo.
                  </div>
                ) : (
                  preds.filter((p) => p.status && String(p.status) !== "pending").map((p) => {
                    const turnoRaw = (p.turno || "").toLowerCase()
                    return (
                      <div key={p.id || p.fecha || p.date} style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: String(p.status) === "WON" ? "#34d399" : String(p.status) === "NEAR_MISS" ? "#fbbf24" : String(p.status) === "LOST" ? "#f87171" : "#94a3b8", marginBottom: 6 }}>
                          {String(p.status) === "WON" ? "✅ GANADA" : String(p.status) === "NEAR_MISS" ? "⚠️ CERCA" : String(p.status) === "LOST" ? "❌ SIN ACERTAR" : "⏳ Pendiente"} — {predLabels[turnoRaw] || turnoRaw} ({p.fecha || p.date || "—"})
                        </div>
                        <div style={{ fontSize: 12, color: "#cbd5e1" }}>
                          Números guardados: <b style={{ color: "#f5c542" }}>{(Array.isArray(p.numeros) ? p.numeros as string[] : p.numeros?.["2"] || []).join(", ")}</b>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {tab === "historial" && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: "14px 0 8px", color: "#f5c542" }}>Datos históricos</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                <div style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,.05)", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#f5c542" }}>{preds.length}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Predicciones guardadas</div>
                </div>
                <div style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,.05)", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#34d399" }}>{preds.filter((p) => p.status === "WON").length}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Aciertos verificados</div>
                </div>
                <div style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,.05)", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24" }}>{preds.filter((p) => p.status === "NEAR_MISS").length}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Cerca del acierto</div>
                </div>
                <div style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,.05)", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#f87171" }}>{preds.filter((p) => p.status === "LOST").length}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Sin coincidir</div>
                </div>
              </div>
              <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "rgba(245,197,66,.08)", border: "1px solid rgba(245,197,66,.15)", fontSize: 12, color: "#cfc8b0", lineHeight: 1.6 }}>
                <b>Nota honesta:</b> estas métricas reflejan solo lo que guardaste. No representan la probabilidad matemática de ganar (la lotería es aleatoria e independiente). El motor optimiza consistencia del modelo, no aciertos garantizados. No hay EV determinista ni premio fijo para Poceada (es poceado / parimutuel).
              </div>
            </div>
          )}

          {tab === "premium" && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: "14px 0 8px", color: "#f5c542" }}>Estado Premium</h2>
              <div style={{ padding: 16, borderRadius: 12, background: premium ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)", border: `1.5px solid ${premium ? "rgba(34,197,94,.3)" : "rgba(239,68,68,.3)"}` }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: premium ? "#34d399" : "#ef4444", marginBottom: 6 }}>
                  {premium ? "⭐ Activo — Premium" : "🆓 Free — sin acceso a 3 y 4 cifras"}
                </div>
                <div style={{ fontSize: 13, color: "#cbd5e1", marginBottom: 10 }}>
                  {premium
                    ? `Tu suscripción vence en ${expDays !== null ? expDays + " días" : "—"}. Acceso completo a Brinco, Poceada y análisis de 3/4 cifras con ML.`
                    : "Para acceder a Brinco, Poceada y análisis avanzados con Machine Learning, actualizá tu plan."}
                </div>
                {!premium && (
                  <button
                    onClick={() => router.push("/predictions")}
                    style={{
                      padding: "10px 18px", borderRadius: 10, border: "none",
                      background: "linear-gradient(135deg,#f5c542,#e0a800)", color: "#111",
                      fontWeight: 800, fontSize: 14, cursor: "pointer",
                      boxShadow: "0 6px 0 rgba(180,130,20,.3),0 8px 20px rgba(245,197,66,.25)",
                    }}
                  >
                    Ver planes y actualizar →
                  </button>
                )}
                {premium && expDays !== null && expDays <= 7 && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#fbbf24", fontWeight: 700 }}>
                    ⚠️ Recordá renovar antes del vencimiento para no perder acceso.
                  </div>
                )}
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
                <b>Reglas de acceso (honestas):</b> Brinco (6 de 40) y Poceada (8 de 00-99) requieren Premium. Quiniela (5 turnos, 2 cifras) es accesible con plan Free o trial. La redoblona (3 cifras + acompañante) y análisis de 4 cifras son exclusivas Premium.
              </div>
            </div>
          )}
        </>
      )}

      {/* Footer de página */}
      <div style={{ marginTop: 30, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,.08)", fontSize: 11, color: "#64748b", textAlign: "center", lineHeight: 1.5 }}>
        <b>Quiniela IA</b> · Perfil de usuario · Datos locales + verificación con sorteos oficiales · No se garantiza ningún resultado · Jugar con responsabilidad.
      </div>
    </div>
  )
}
