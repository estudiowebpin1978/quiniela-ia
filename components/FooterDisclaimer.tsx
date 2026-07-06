"use client"

export default function FooterDisclaimer() {
  return (
    <footer style={{ marginTop: 24, padding: "16px 16px", borderTop: "1px solid rgba(255,255,255,.06)", background: "rgba(0,0,0,0.2)" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 800, marginBottom: 12, padding: "10px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.2)", lineHeight: 1.5 }}>
          ⚠️ EL JUEGO COMPULSIVO ES PERJUDICIAL PARA LA SALUD
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <a
            href="tel:08006666006"
            style={{
              padding: "10px 20px", backgroundColor: "#6366f1", color: "#fff", textDecoration: "none",
              borderRadius: 10, fontWeight: 700, width: "100%", maxWidth: 320, fontSize: 13,
              boxShadow: "0 4px 0 #4338ca, 0 6px 16px rgba(99,102,241,.3), inset 0 1px 0 rgba(255,255,255,.2)",
              transition: "all .15s", display: "block", textAlign: "center"
            }}
          >
            📞 Llamar Línea Nacional: 0800-666-6006
          </a>
          <a
            href="tel:08004444000"
            style={{
              padding: "10px 20px", backgroundColor: "#475569", color: "#fff", textDecoration: "none",
              borderRadius: 10, fontWeight: 600, width: "100%", maxWidth: 320, fontSize: 13,
              boxShadow: "0 4px 0 #334155, 0 6px 12px rgba(0,0,0,.2), inset 0 1px 0 rgba(255,255,255,.1)",
              transition: "all .15s", display: "block", textAlign: "center"
            }}
          >
            📞 Prov. Buenos Aires: 0800-444-4000
          </a>
        </div>

        <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6, marginBottom: 8, padding: "10px 12px", background: "rgba(99,102,241,0.06)", borderRadius: 8, border: "1px solid rgba(99,102,241,0.12)" }}>
          <strong style={{ color: "#a5b4fc" }}>Herramienta de análisis estadístico.</strong> Los sorteos son eventos aleatorios e independientes. Los análisis muestran tendencias históricas que <strong>no garantizan resultados futuros</strong>. No vende boletos ni procesa apuestas.
        </div>

        <div style={{ fontSize: 10, color: "#64748b", lineHeight: 1.5, marginBottom: 8 }}>
          Al registrarte en esta plataforma, aceptás que el servicio es exclusivo para mayores de 18 años. Quiniela IA promueve el Juego Responsable. Si vos o alguien que conocés tiene problemas con las apuestas, recordá que la línea nacional <strong style={{ color: "#a5b4fc" }}>0800-666-6006</strong> ofrece orientación gratuita y confidencial las 24 horas en todo el territorio argentino.
        </div>

        <div style={{ fontSize: 10, color: "#475569", marginBottom: 6 }}>
          Servicios gratuitos, confidenciales y disponibles en toda la República Argentina. Para más información visitá{" "}
          <a href="https://saberjugar.gob.ar" target="_blank" rel="noopener noreferrer" style={{ color: "#6366f1", textDecoration: "none" }}>saberjugar.gob.ar</a>
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
