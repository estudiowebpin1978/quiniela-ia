"use client"

export default function FooterDisclaimer() {
  return (
    <footer style={{ marginTop: 24, padding: "16px 16px", borderTop: "1px solid rgba(255,255,255,.06)", background: "rgba(0,0,0,0.2)" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 800, marginBottom: 10, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.2)", lineHeight: 1.5 }}>
          ⚠️ EL JUEGO COMPULSIVO ES PERJUDICIAL PARA LA SALUD
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <a href="tel:08006666006" style={{ padding: "8px 16px", backgroundColor: "#6366f1", color: "#fff", textDecoration: "none", borderRadius: 8, fontWeight: 700, fontSize: 12 }}>
            📞 0800-666-6006
          </a>
          <a href="tel:08004444000" style={{ padding: "8px 16px", backgroundColor: "#475569", color: "#fff", textDecoration: "none", borderRadius: 8, fontWeight: 600, fontSize: 12 }}>
            📞 0800-444-4000
          </a>
        </div>

        <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.5, marginBottom: 8 }}>
          Herramienta de análisis estadístico. Los sorteos son eventos aleatorios e independientes. No garantiza resultados futuros. No vende boletos ni procesa apuestas.
        </div>

        <div style={{ fontSize: 9, color: "#64748b", lineHeight: 1.4, marginBottom: 8 }}>
          Solo mayores de 18 años. Juego Responsable ·{" "}
          <a href="https://saberjugar.gob.ar" target="_blank" rel="noopener noreferrer" style={{ color: "#6366f1", textDecoration: "none" }}>saberjugar.gob.ar</a>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          <a href="/privacidad" style={{ fontSize: 9, color: "#6366f1", textDecoration: "none" }}>Privacidad</a>
          <span style={{ fontSize: 9, color: "#334155" }}>·</span>
          <a href="/terminos" style={{ fontSize: 9, color: "#6366f1", textDecoration: "none" }}>Términos</a>
          <span style={{ fontSize: 9, color: "#334155" }}>·</span>
          <a href="mailto:estudiowebpin@gmail.com" style={{ fontSize: 9, color: "#6366f1", textDecoration: "none" }}>Soporte</a>
        </div>
        <div style={{ fontSize: 8, color: "#334155", marginTop: 6 }}>
          © {new Date().getFullYear()} Quiniela IA · Desarrollado por EstudioWebPin
        </div>
      </div>
    </footer>
  )
}
