"use client"

export default function FooterDisclaimer() {
  return (
    <footer style={{ marginTop: 40, padding: "20px 16px", borderTop: "1px solid rgba(255,255,255,.06)", background: "rgba(0,0,0,0.2)" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.7, marginBottom: 10 }}>
          <strong style={{ color: "#64748b" }}>Quiniela IA</strong> es una herramienta de análisis estadístico con fines de entretenimiento. No garantiza resultados. No es un sitio de apuestas.
        </div>
        <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 10 }}>
          🛑 Si tenés problemas con el juego, llamá al <strong>0800-333-0062</strong> (Línea de Ayuda). Jugá con responsabilidad.
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          <a href="/privacidad" style={{ fontSize: 10, color: "#6366f1", textDecoration: "none" }}>Privacidad</a>
          <span style={{ fontSize: 10, color: "#334155" }}>·</span>
          <a href="/terminos" style={{ fontSize: 10, color: "#6366f1", textDecoration: "none" }}>Términos</a>
          <span style={{ fontSize: 10, color: "#334155" }}>·</span>
          <a href="mailto:estudiowebpin@gmail.com" style={{ fontSize: 10, color: "#6366f1", textDecoration: "none" }}>Soporte</a>
        </div>
        <div style={{ fontSize: 9, color: "#334155" }}>
          © 2025 Quiniela IA · Desarrollado por EstudioWebPin
        </div>
      </div>
    </footer>
  )
}
