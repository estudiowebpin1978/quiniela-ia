"use client"

export default function FooterDisclaimer() {
  return (
    <footer
      style={{
        marginTop: 40,
        padding: "20px 16px",
        borderTop: "1px solid rgba(255,255,255,.06)",
        background: "rgba(0,0,0,0.2)"
      }}
    >
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>
            ⚠️ AVISO IMPORTANTE
          </div>
          <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.7 }}>
            Quiniela IA es una <strong style={{ color: "#64748b" }}>herramienta de análisis estadístico</strong> con fines
            de entretenimiento e investigación. <strong style={{ color: "#64748b" }}>No garantiza resultados</strong> en ningún
            sorteo. Los datos provienen de fuentes públicas oficiales.
          </div>
        </div>

        <div style={{ textAlign: "center", marginBottom: 12, padding: "10px 14px", background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)", borderRadius: 10 }}>
          <div style={{ fontSize: 10, color: "#fca5a5", lineHeight: 1.7 }}>
            🛑 <strong>Si o alguien que conocés tiene problemas con el juego</strong>, comunicate al
            teléfono gratuito <strong style={{ color: "#ef4444" }}>0800-333-0062</strong> (Línea de Ayuda al Ludópata).
            Juega con responsabilidad.
          </div>
        </div>

        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6 }}>
            Esta aplicación <strong style={{ color: "#64748b" }}>no es un sitio de apuestas</strong> y no procesa
            dinero. Cualquier decisión de jugar es responsabilidad exclusiva del usuario.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
          <a href="/privacidad" style={{ fontSize: 10, color: "#6366f1", textDecoration: "none" }}>Política de Privacidad</a>
          <span style={{ fontSize: 10, color: "#334155" }}>·</span>
          <a href="/terminos" style={{ fontSize: 10, color: "#6366f1", textDecoration: "none" }}>Términos de Uso</a>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "#334155", lineHeight: 1.5 }}>
            © 2025 Quiniela IA · Análisis estadístico con Machine Learning
            <br />
            Datos: quinielanacional1.com.ar · loteria.loteriadelaciudad.gob.ar
          </div>
        </div>
      </div>
    </footer>
  )
}
