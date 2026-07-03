"use client"

export default function FooterDisclaimer() {
  return (
    <footer style={{ marginTop: 24, padding: "16px 16px", borderTop: "1px solid rgba(255,255,255,.06)", background: "rgba(0,0,0,0.2)" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.6, marginBottom: 6, padding: "8px 12px", background: "rgba(99,102,241,0.08)", borderRadius: 8, border: "1px solid rgba(99,102,241,0.15)" }}>
          ⚠️ <strong style={{ color: "#a5b4fc" }}>Herramienta de análisis, no predicción.</strong> Los sorteos de quiniela son eventos aleatorios e independientes. Los análisis muestran tendencias históricas que <strong>no garantizan resultados futuros</strong>.
        </div>
        <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.5 }}>
          Quiniela IA es una herramienta de análisis estadístico con fines de entretenimiento. No garantiza resultados. No vende boletos ni procesa apuestas. Línea de ayuda: <strong style={{ color: "#64748b" }}>0800-333-0062</strong>. Solo mayores de 18 años.
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
          <a href="/privacidad" style={{ fontSize: 9, color: "#6366f1", textDecoration: "none" }}>Privacidad</a>
          <span style={{ fontSize: 9, color: "#334155" }}>·</span>
          <a href="/terminos" style={{ fontSize: 9, color: "#6366f1", textDecoration: "none" }}>Términos</a>
          <span style={{ fontSize: 9, color: "#334155" }}>·</span>
          <a href="mailto:estudiowebpin@gmail.com" style={{ fontSize: 9, color: "#6366f1", textDecoration: "none" }}>Soporte</a>
        </div>
        <div style={{ fontSize: 8, color: "#334155", marginTop: 4 }}>
          © {new Date().getFullYear()} Quiniela IA · Desarrollado por EstudioWebPin
        </div>
      </div>
    </footer>
  )
}
