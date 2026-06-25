"use client"

interface PayCTAProps {
  guestMode: boolean;
  onPaywall: () => void;
  onLogin: () => void;
}

export default function PayCTA({ guestMode, onPaywall, onLogin }: PayCTAProps) {
  return (
    <div style={{
      background: "linear-gradient(135deg,rgba(168,85,247,.08),rgba(99,102,241,.08))",
      border: "1px solid rgba(168,85,247,.2)",
      borderRadius: 16, padding: 20, marginTop: 20, textAlign: "center"
    }}>
      <div style={{ fontSize: 20, fontWeight: 900, background: "linear-gradient(135deg,#a855f7,#6366f1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 8 }}>
        Desbloqueá el análisis completo
      </div>
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12, lineHeight: 1.6 }}>
        Con Premium tenés acceso a predicciones de 3 y 4 cifras, historial de análisis, y comparación de resultados.
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ background: "rgba(168,85,247,.12)", borderRadius: 8, padding: "6px 12px", fontSize: 11, color: "#c4b5fd" }}>✓ 3 cifras (5 números)</div>
        <div style={{ background: "rgba(168,85,247,.12)", borderRadius: 8, padding: "6px 12px", fontSize: 11, color: "#c4b5fd" }}>✓ 4 cifras (5 números)</div>
        <div style={{ background: "rgba(168,85,247,.12)", borderRadius: 8, padding: "6px 12px", fontSize: 11, color: "#c4b5fd" }}>✓ Historial completo</div>
      </div>
      <button
        onClick={() => guestMode ? onLogin() : onPaywall()}
        style={{
          marginTop: 14, padding: "12px 28px", borderRadius: 12,
          background: "linear-gradient(135deg,#a855f7,#6366f1)",
          color: "#fff", border: "none", fontWeight: 800, fontSize: 14,
          cursor: "pointer", boxShadow: "0 6px 20px rgba(168,85,247,.4)"
        }}
      >
        {guestMode ? "🔑 Crear cuenta gratis" : "⭐ Activar Premium"}
      </button>
      <div style={{ fontSize: 9, color: "#475569", marginTop: 8 }}>Desde $3.500/mes · Cancelá cuando quieras</div>
    </div>
  )
}
