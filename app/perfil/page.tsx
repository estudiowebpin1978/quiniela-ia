"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { getAuth } from "@/lib/auth"
import { validateMisPrediccionesResponse, type MisPrediccion } from "@/lib/api/predictions"
import { fechaLarga } from "@/lib/poceada/fechas"
import "./perfil.css"

export default function PerfilPage() {
  const router = useRouter()
  const [auth, setAuth] = useState<ReturnType<typeof getAuth> | null>(null)
  const [preds, setPreds] = useState<MisPrediccion[]>([])
  const [premium, setPremium] = useState(false)
  const [expDays, setExpDays] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"pred" | "verif" | "hist" | "premium">("pred")

  const cargar = useCallback(async () => {
    const a = getAuth()
    setAuth(a)
    if (!a?.access_token) { setLoading(false); return }
    try {
      const r = await fetch("/api/auth/me", { headers: { Authorization: "Bearer " + a.access_token } })
      if (r.ok) {
        const d = await r.json()
        setPremium(!!(d?.canAccessPremiumFeatures || d?.role === "premium" || d?.role === "admin"))
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
        try { setPreds(validateMisPrediccionesResponse({ predictions: arr }).predictions) } catch { setPreds(arr as MisPrediccion[]) }
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const predLabels: Record<string, string> = { previs: "Previa", primera: "Primera", matutina: "Matutina", vespertina: "Vespertina", nocturna: "Nocturna", poceada: "Poceada", brinco: "Brinco" }

  const won = preds.filter((p) => String(p.status) === "WON").length
  const near = preds.filter((p) => String(p.status) === "NEAR_MISS").length
  const lost = preds.filter((p) => String(p.status) === "LOST").length

  const tabs = [
    { id: "pred" as const, label: "📋 Predicciones", desc: "Jugadas guardadas" },
    { id: "verif" as const, label: "✅ Verificación", desc: "Aciertos vs sorteos oficiales" },
    { id: "hist" as const, label: "📊 Histórico", desc: "Precisión y tendencias" },
    { id: "premium" as const, label: "⭐ Premium", desc: "Plan, renovación, upgrade" },
  ]

  return (
    <div className="pf-wrap">
      {/* Header */}
      <div className="pf-head">
        <button className="pf-btn-ghost" style={{ padding: "6px 12px", fontSize: 11 }} onClick={() => router.push("/predictions")}>
          ← Volver
        </button>
        <h1 className="pf-title">Perfil</h1>
        <span className="pf-badge" style={{ marginLeft: "auto", background: premium ? "linear-gradient(135deg,rgba(245,197,66,.15),rgba(245,197,66,.06))" : "rgba(255,255,255,.06)", color: premium ? "#f5c542" : "#94a3b8", borderColor: premium ? "rgba(245,197,66,.35)" : "rgba(255,255,255,.12)" }}>
          {premium ? (expDays !== null ? `Premium · ${expDays}d` : "Premium") : "Free"}
        </span>
      </div>
      <p className="pf-sub">Tu espacio: predicciones, verificación oficial, datos históricos y gestión del plan.</p>

      {/* Tabs */}
      <div className="pf-tabs">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`pf-tab ${tab === t.id ? "on" : ""}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {loading ? (
        <div style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Cargando tu perfil…</div>
      ) : (
        <>
          {tab === "pred" && (
            <div>
              <h2 className="pf-card" style={{ fontSize: 15, fontWeight: 800, margin: "0 0 8px", color: "#f5c542" }}>Predicciones guardadas</h2>
              {preds.length === 0 ? (
                <div className="pf-card" style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: 16 }}>
                  Todavía no guardaste ninguna predicción.<br />
                  <button className="pf-btn pf-btn-primary" style={{ marginTop: 10 }} onClick={() => router.push("/predictions")}>Ir a generar análisis →</button>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {preds.map((p) => {
                    const nums = Array.isArray(p.numeros) ? (p.numeros as string[]) : (p.numeros?.["2"] ? (p.numeros["2"] as string[]) : [])
                    const turnoRaw = (p.turno || "").toLowerCase()
                    return (
                      <div key={p.id || p.fecha || p.date || Math.random()} className="pf-card" style={{ padding: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                          <b style={{ fontSize: 13, color: "#e6e6e6" }}>{predLabels[turnoRaw] || turnoRaw} — {p.fecha || p.date || "—"}</b>
                          <span style={{ fontSize: 11, color: String(p.status) === "WON" ? "#34d399" : "#94a3b8", fontWeight: 700 }}>{String(p.status) === "WON" ? "GANADA" : String(p.status) === "NEAR_MISS" ? "CERCA" : String(p.status) === "LOST" ? "SIN ACERTAR" : "PENDIENTE"}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                          {nums.map((n) => <span key={n} className="pf-num">{n}</span>)}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{(p.aciertos?.length ?? 0)} aciertos registrados · {String(p.created_at || "").slice(0, 10)}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "verif" && (
            <div>
              <h2 className="pf-card" style={{ fontSize: 15, fontWeight: 800, margin: "0 0 8px", color: "#f5c542" }}>Verificación oficial</h2>
              <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>Comparación automática con sorteos oficiales LOTBA / CAS.</p>
              <div style={{ display: "grid", gap: 10 }}>
                {preds.filter((p) => String(p.status) !== "pending").length === 0 ? (
                  <div className="pf-card" style={{ color: "#94a3b8", textAlign: "center", padding: 16, fontSize: 13 }}>Todavía no hay resultados oficiales verificados.</div>
                ) : (
                  preds.filter((p) => String(p.status) !== "pending").map((p) => (
                    <div key={p.id || p.fecha || p.date} className="pf-card" style={{ padding: 14 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: String(p.status) === "WON" ? "#34d399" : String(p.status) === "NEAR_MISS" ? "#fbbf24" : "#f87171", marginBottom: 6 }}>
                        {String(p.status) === "WON" ? "✅ GANADA" : String(p.status) === "NEAR_MISS" ? "⚠️ CERCA" : "❌ SIN ACERTAR"} — {predLabels[(p.turno || "").toLowerCase()] || p.turno || "—"} ({p.fecha || p.date || "—"})
                      </div>
                      <div style={{ fontSize: 12, color: "#cbd5e1" }}>
                        Números: <b style={{ color: "#f5c542" }}>{(Array.isArray(p.numeros) ? p.numeros as string[] : p.numeros?.["2"] || []).join(", ")}</b>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === "hist" && (
            <div>
              <h2 className="pf-card" style={{ fontSize: 15, fontWeight: 800, margin: "0 0 8px", color: "#f5c542" }}>Datos históricos</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 10 }}>
                <div className="pf-card" style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#f5c542" }}>{preds.length}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Predicciones guardadas</div>
                </div>
                <div className="pf-card" style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#34d399" }}>{won}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Aciertos verificados</div>
                </div>
                <div className="pf-card" style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24" }}>{near}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Cerca del acierto</div>
                </div>
                <div className="pf-card" style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#f87171" }}>{lost}</div>
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
              <h2 className="pf-card" style={{ fontSize: 15, fontWeight: 800, margin: "0 0 8px", color: "#f5c542" }}>Estado Premium</h2>
              <div className="pf-card" style={{ background: premium ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)", border: `1.5px solid ${premium ? "rgba(34,197,94,.3)" : "rgba(239,68,68,.3)"}` }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: premium ? "#34d399" : "#ef4444", marginBottom: 6 }}>{premium ? "⭐ Activo — Premium" : "🆓 Free — sin acceso a 3 y 4 cifras"}</div>
                <div style={{ fontSize: 13, color: "#cbd5e1", marginBottom: 10 }}>{premium ? `Tu suscripción vence en ${expDays !== null ? expDays + " días" : "—"}. Acceso completo a Brinco, Poceada y análisis de 3/4 cifras con ML.` : "Para acceder a Brinco, Poceada y análisis avanzados con Machine Learning, actualizá tu plan."}</div>
                {!premium && (
                  <button className="pf-btn pf-btn-primary" onClick={() => router.push("/predictions")}>Ver planes y actualizar →</button>
                )}
                {premium && expDays !== null && expDays <= 7 && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#fbbf24", fontWeight: 700 }}>⚠️ Recordá renovar antes del vencimiento para no perder acceso.</div>
                )}
              </div>
              <div className="pf-card" style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
                <b>Reglas de acceso:</b> Brinco (6 de 40) y Poceada (8 de 00-99) requieren Premium. Quiniela (5 turnos, 2 cifras) accesible con Free/trial. Redoblona (3 cifras + acompañante) y 4 cifras exclusivos Premium.
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 30, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,.08)", fontSize: 11, color: "#64748b", textAlign: "center", lineHeight: 1.5 }}>
        <b>Quiniela IA</b> · Perfil · Datos locales + verificación con sorteos oficiales · No se garantiza ningún resultado · Jugar con responsabilidad.
      </div>
    </div>
  )
}
