"use client"

type Props = {
  open: boolean
  onClose: () => void
  onWhatsApp: () => void
}

export default function PaywallModal({ open, onClose, onWhatsApp }: Props) {
  if (!open) return null

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
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🧠</div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginBottom: 8, lineHeight: 1.3 }}>
            La IA ya calculó las probabilidades para los sorteos de hoy.
          </h2>
          <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
            Desbloqueá el análisis completo con <strong style={{ color: "#a855f7" }}>30 factores estadísticos</strong> y <strong style={{ color: "#a855f7" }}>Machine Learning</strong>.
          </p>
        </div>

        {/* Pase Semanal - Destacado */}
        <div
          style={{
            border: "2px solid #a855f7", borderRadius: 16, padding: 16, marginBottom: 12,
            background: "linear-gradient(135deg,rgba(168,85,247,.12),rgba(99,102,241,.08))",
            position: "relative", cursor: "pointer", transition: "all .2s"
          }}
          onClick={() => window.open("https://wa.me/5493412500029?text=Hola!%20Quiero%20activar%20Premium%20de%20Quiniela%20IA.", "_blank")}
        >
          <div style={{
            position: "absolute", top: -10, right: 12,
            background: "linear-gradient(135deg,#a855f7,#7c3aed)",
            color: "#fff", fontSize: 10, fontWeight: 800, padding: "4px 10px",
            borderRadius: 8, letterSpacing: 0.5
          }}>
            MÁS ELEGIDO
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Pase Semanal</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>7 días de acceso completo</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#a855f7" }}>$3.500</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>ARS</div>
            </div>
          </div>
        </div>

        {/* Pase Mensual */}
        <div
          style={{
            border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 16, marginBottom: 20,
            background: "rgba(255,255,255,.03)", cursor: "pointer", transition: "all .2s"
          }}
          onClick={() => window.open("https://wa.me/5493412500029?text=Hola!%20Quiero%20activar%20Premium%20Mensual%20de%20Quiniela%20IA.", "_blank")}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Pase Mensual</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>30 días · Ahorrás 40%</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#22c55e" }}>$10.000</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>ARS</div>
            </div>
          </div>
        </div>

        <button
          onClick={onWhatsApp}
          style={{
            width: "100%", border: "none", borderRadius: 14, padding: "16px",
            background: "linear-gradient(135deg,#25D366,#128C7E)", color: "#fff",
            fontSize: 15, fontWeight: 800, cursor: "pointer",
            boxShadow: "0 6px 0 #075E54,0 8px 24px rgba(37,211,102,0.3)"
          }}
        >
          💬 Activar por WhatsApp
        </button>

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

        <div style={{ fontSize: 10, color: "#475569", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
          Pago por transferencia · Activación manual en minutos · Sin suscripción automática
        </div>
      </div>
    </div>
  )
}
