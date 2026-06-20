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
              <div
                key={p.key}
                style={{
                  border: p.badge ? "2px solid #a855f7" : "1px solid rgba(255,255,255,.1)",
                  borderRadius: 16, padding: 16, marginBottom: 12,
                  background: p.badge
                    ? "linear-gradient(135deg,rgba(168,85,247,.12),rgba(99,102,241,.08))"
                    : "rgba(255,255,255,.03)",
                  position: "relative", cursor: "pointer", transition: "all .2s",
                }}
                onClick={() => { setSelectedPlan(p.key); setStep("method"); }}
              >
                {p.badge && (
                  <div style={{
                    position: "absolute", top: -10, right: 12,
                    background: "linear-gradient(135deg,#a855f7,#7c3aed)",
                    color: "#fff", fontSize: 10, fontWeight: 800, padding: "4px 10px",
                    borderRadius: 8, letterSpacing: 0.5
                  }}>
                    {p.badge}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{p.label}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{p.days}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: p.color }}>{p.price}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>ARS</div>
                  </div>
                </div>
              </div>
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

            {/* Card option */}
            <div
              style={{
                border: "2px solid rgba(99,102,241,.4)", borderRadius: 16, padding: 16, marginBottom: 10,
                background: "linear-gradient(135deg,rgba(99,102,241,.1),rgba(139,92,246,.08))",
                cursor: "pointer", transition: "all .2s",
                opacity: loading ? 0.5 : 1, position: "relative",
              }}
              onClick={() => handleCardPay(currentPlan.key)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 28 }}>💳</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>Tarjeta de crédito o débito</div>
                  <div style={{ fontSize: 12, color: "#4ade80", marginTop: 2, fontWeight: 600 }}>✓ Activación inmediata</div>
                </div>
                <div style={{ fontSize: 18, color: "#64748b" }}>→</div>
              </div>
              {loading === currentPlan.key && (
                <div style={{
                  position: "absolute", inset: 0, borderRadius: 16,
                  background: "rgba(0,0,0,.6)", display: "flex",
                  alignItems: "center", justifyContent: "center"
                }}>
                  <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>Procesando...</div>
                </div>
              )}
            </div>

            {/* Alias option */}
            <div
              style={{
                border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 16, marginBottom: 16,
                background: "rgba(255,255,255,.03)", cursor: "pointer", transition: "all .2s",
              }}
              onClick={() => setStep("alias")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 28 }}>🏦</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>Transferencia</div>
                  <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 2, fontWeight: 600 }}>⏳ En 24hs</div>
                </div>
                <div style={{ fontSize: 18, color: "#64748b" }}>→</div>
              </div>
            </div>

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

            <a
              href={WA_LINK}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault()
                copyAlias()
                window.open(WA_LINK, "_blank")
              }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", border: "none", borderRadius: 14, padding: "14px",
                background: "linear-gradient(135deg,#25D366,#128C7E)", color: "#fff",
                fontSize: 14, fontWeight: 800, cursor: "pointer", textDecoration: "none",
                boxShadow: "0 6px 0 #075E54,0 8px 24px rgba(37,211,102,0.3)"
              }}
            >
              📲 Enviar comprobante por WhatsApp
            </a>

            <div style={{ fontSize: 10, color: "#475569", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
              La activación puede tardar hasta 24hs háiles tras confirmar el pago
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
