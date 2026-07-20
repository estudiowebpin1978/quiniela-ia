"use client"
import { useState } from "react"
import { getAccessToken } from "@/lib/auth"

type Props = {
  open: boolean
  onClose: () => void
  userId: string | null
}

const PLANS = [
  { key: "semanal", label: "Pase Semanal", price: "$3.500", days: "7 días de acceso completo", color: "#a855f7", badge: "MÁS ELEGIDO" },
  { key: "mensual", label: "Pase Mensual", price: "$10.000", days: "30 días · Ahorrás 40%", color: "#22c55e", badge: "" },
]

const ALIAS = "quiniela.ia"
const WA_LINK = "https://api.whatsapp.com/send?phone=5493412500029"

export default function PaywallModal({ open, onClose, userId }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [step, setStep] = useState<"plan" | "method" | "alias">("plan")
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!open) return null

  async function handleCardPay(plan: string) {
    if (!userId) { setError("Iniciá sesión para continuar"); return }
    setLoading(plan); setError("")
    try {
      const token = getAccessToken()
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ plan, userId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error creando la orden")
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else {
        throw new Error("No se recibió la URL de pago")
      }
    } catch (e: any) {
      setError(e.message || "Error procesando el pago")
      setLoading(null)
    }
  }

  function copyAlias() {
    navigator.clipboard.writeText(ALIAS).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    })
  }

  function goBack() {
    if (step === "alias") setStep("method")
    else setStep("plan")
    setError("")
    setCopied(false)
  }

  const currentPlan = PLANS.find(p => p.key === selectedPlan)

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.85)",
        zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "linear-gradient(180deg,rgba(20,20,40,0.98),rgba(10,10,25,1))",
          border: "1px solid rgba(255,255,255,.1)", borderRadius: 24,
          padding: "32px 24px", maxWidth: 380, width: "100%",
          boxShadow: "0 40px 120px rgba(0,0,0,0.8),inset 0 1px 0 rgba(255,255,255,.05)"
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* STEP 1: Choose plan */}
        {step === "plan" && (
          <>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🧠</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginBottom: 8, lineHeight: 1.3 }}>
                Desbloqueá el análisis completo
              </h2>
              <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
                <strong style={{ color: "#a855f7" }}>30 factores estadísticos</strong> + <strong style={{ color: "#a855f7" }}>Machine Learning</strong> para cada sorteo.
              </p>
            </div>

            {PLANS.map(p => (
              <button
                key={p.key}
                onClick={() => { setSelectedPlan(p.key); setStep("method"); }}
                style={{
                  width: "100%", border: "none", borderRadius: 16, padding: 16, marginBottom: 12,
                  background: p.badge
                    ? "linear-gradient(135deg,#7c3aed,#6366f1,#4f46e5)"
                    : "linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,.04))",
                  cursor: "pointer", transition: "all .15s", textAlign: "left", position: "relative",
                  boxShadow: p.badge
                    ? "0 6px 0 #4338ca, 0 8px 24px rgba(99,102,241,0.4), inset 0 2px 0 rgba(255,255,255,0.2)"
                    : "0 4px 0 rgba(255,255,255,.08), 0 6px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,.06)",
                }}
                onMouseDown={e => { e.currentTarget.style.transform = "translateY(3px)" }}
                onMouseUp={e => { e.currentTarget.style.transform = "translateY(0)" }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)" }}
              >
                {p.badge && (
                  <div style={{
                    position: "absolute", top: -10, right: 12,
                    background: "linear-gradient(135deg,#f59e0b,#d97706)",
                    color: "#fff", fontSize: 10, fontWeight: 800, padding: "4px 10px",
                    borderRadius: 8, letterSpacing: 0.5,
                    boxShadow: "0 2px 8px rgba(245,158,11,0.4)"
                  }}>
                    {p.badge}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{p.label}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{p.days}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: p.badge ? "#fbbf24" : "#a5b4fc" }}>{p.price}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>ARS</div>
                  </div>
                </div>
              </button>
            ))}

            <button
              onClick={onClose}
              style={{
                width: "100%", border: "none", borderRadius: 12, padding: "12px",
                background: "transparent", color: "#64748b",
                fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 8
              }}
            >
              Ahora no
            </button>
          </>
        )}

        {/* STEP 2: Choose payment method */}
        {step === "method" && currentPlan && (
          <>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <button onClick={goBack} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", marginBottom: 8 }}>
                ← Volver
              </button>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginBottom: 4 }}>
                Elegí cómo pagar
              </h2>
              <div style={{ fontSize: 22, fontWeight: 900, color: currentPlan.color, marginBottom: 4 }}>
                {currentPlan.label} — {currentPlan.price}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>{currentPlan.days}</div>
            </div>

            {/* Card option — primary 3D button */}
            <button
              disabled={!!loading}
              onClick={() => handleCardPay(currentPlan.key)}
              style={{
                width: "100%", border: "none", borderRadius: 16, padding: "18px 16px", marginBottom: 12,
                background: "linear-gradient(135deg,#6366f1,#8b5cf6,#a855f7)",
                cursor: loading ? "wait" : "pointer", transition: "all .15s", position: "relative",
                opacity: loading ? 0.6 : 1,
                boxShadow: "0 6px 0 #4338ca, 0 8px 24px rgba(99,102,241,0.4), inset 0 2px 0 rgba(255,255,255,0.2)",
                transform: loading ? "none" : "translateY(0)",
              }}
              onMouseDown={e => { if (!loading) (e.currentTarget.style.transform = "translateY(3px)") }}
              onMouseUp={e => { (e.currentTarget.style.transform = "translateY(0)") }}
              onMouseLeave={e => { (e.currentTarget.style.transform = "translateY(0)") }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
                <div style={{ fontSize: 26 }}>💳</div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>Tocá aquí para pagar con tarjeta</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2, fontWeight: 600 }}>Crédito o débito · Activación inmediata</div>
                </div>
              </div>
              {loading === currentPlan.key && (
                <div style={{
                  position: "absolute", inset: 0, borderRadius: 16,
                  background: "rgba(0,0,0,.5)", display: "flex",
                  alignItems: "center", justifyContent: "center"
                }}>
                  <div style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>Procesando...</div>
                </div>
              )}
            </button>

            {/* Transfer option — secondary 3D button */}
            <button
              onClick={() => setStep("alias")}
              style={{
                width: "100%", border: "none", borderRadius: 16, padding: "18px 16px", marginBottom: 16,
                background: "linear-gradient(135deg,#f59e0b,#d97706,#b45309)",
                cursor: "pointer", transition: "all .15s",
                boxShadow: "0 6px 0 #92400e, 0 8px 24px rgba(245,158,11,0.3), inset 0 2px 0 rgba(255,255,255,0.15)",
              }}
              onMouseDown={e => { e.currentTarget.style.transform = "translateY(3px)" }}
              onMouseUp={e => { e.currentTarget.style.transform = "translateY(0)" }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
                <div style={{ fontSize: 26 }}>🏦</div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>Transferencia bancaria</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2, fontWeight: 600 }}>Alias · Activación en 24hs</div>
                </div>
              </div>
            </button>

            {error && (
              <div style={{
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 10, padding: "12px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 12
              }}>
                {error}
              </div>
            )}

            <button
              onClick={onClose}
              style={{
                width: "100%", border: "none", borderRadius: 12, padding: "12px",
                background: "transparent", color: "#64748b",
                fontSize: 13, fontWeight: 600, cursor: "pointer"
              }}
            >
              Ahora no
            </button>
          </>
        )}

        {/* STEP 3: Alias payment details */}
        {step === "alias" && currentPlan && (
          <>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <button onClick={goBack} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", marginBottom: 8 }}>
                ← Volver
              </button>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginBottom: 4 }}>
                Pago por transferencia
              </h2>
              <div style={{ fontSize: 22, fontWeight: 900, color: currentPlan.color, marginBottom: 4 }}>
                {currentPlan.label} — {currentPlan.price}
              </div>
            </div>

            <div style={{
              background: "rgba(99,102,241,.1)", border: "1px solid rgba(99,102,241,.3)",
              borderRadius: 16, padding: 20, textAlign: "center", marginBottom: 16
            }}>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>Alias para transferir</div>
              <div
                onClick={copyAlias}
                style={{
                  fontSize: 26, fontWeight: 900, color: "#818cf8", letterSpacing: 2,
                  padding: "14px 24px", background: "rgba(0,0,0,.3)", borderRadius: 12,
                  cursor: "pointer", border: "2px solid rgba(129,140,248,.3)",
                  transition: "all .2s", userSelect: "all",
                }}
              >
                {ALIAS}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                {copied ? (
                  <span style={{ color: "#4ade80", fontWeight: 700 }}>✓ Copiado al portapapeles</span>
                ) : (
                  "Tocá aquí para copiar Alias"
                )}
              </div>
            </div>

            <div style={{
              background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.2)",
              borderRadius: 12, padding: "14px 16px", marginBottom: 16
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b", marginBottom: 6 }}>Pasos para activar:</div>
              <div style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.8 }}>
                1. Abrí tu app de banco<br/>
                2. Transferí <strong style={{ color: "#fff" }}>{currentPlan.price}</strong> al alias <strong style={{ color: "#818cf8" }}>{ALIAS}</strong><br/>
                3. Enviá el comprobante por WhatsApp
              </div>
            </div>

            <button
              onClick={(e) => {
                copyAlias()
                window.open(WA_LINK, "_blank")
              }}
              style={{
                width: "100%", border: "none", borderRadius: 14, padding: "16px",
                background: "linear-gradient(135deg,#25D366,#128C7E,#075E54)", color: "#fff",
                fontSize: 15, fontWeight: 900, cursor: "pointer",
                boxShadow: "0 6px 0 #064E3B, 0 8px 24px rgba(37,211,102,0.35), inset 0 2px 0 rgba(255,255,255,0.15)",
              }}
              onMouseDown={e => { e.currentTarget.style.transform = "translateY(3px)" }}
              onMouseUp={e => { e.currentTarget.style.transform = "translateY(0)" }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)" }}
            >
              📲 Enviar comprobante por WhatsApp
            </button>

            <div style={{ fontSize: 10, color: "#475569", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
              La activación puede tardar hasta 24hs hábiles tras confirmar el pago
            </div>

            <button
              onClick={onClose}
              style={{
                width: "100%", border: "none", borderRadius: 12, padding: "12px",
                background: "transparent", color: "#64748b",
                fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 4
              }}
            >
              Ahora no
            </button>
          </>
        )}
      </div>
    </div>
  )
}
