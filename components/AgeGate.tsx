"use client"
import { useState, useEffect } from "react"

export default function AgeGate() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const verified = localStorage.getItem("quiniela-ia-age-verified")
    if (!verified) setShow(true)
  }, [])

  function verify() {
    localStorage.setItem("quiniela-ia-age-verified", "true")
    setShow(false)
  }

  if (!show) return null

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.95)",
      zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }}>
      <div style={{
        background: "linear-gradient(180deg,rgba(20,20,40,0.98),rgba(10,10,25,1))",
        border: "1px solid rgba(255,255,255,.1)", borderRadius: 24,
        padding: "32px 24px", maxWidth: 380, width: "100%", textAlign: "center",
        boxShadow: "0 40px 120px rgba(0,0,0,0.8)"
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginBottom: 8 }}>
          Confirmá tu edad
        </h2>
        <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, marginBottom: 20 }}>
          Esta aplicación es para <strong style={{ color: "#fff" }}>mayores de 18 años</strong>.
          <br />Contiene análisis estadístico de la Quiniela Nacional.
        </p>
        <button
          onClick={verify}
          style={{
            width: "100%", border: "none", borderRadius: 14, padding: "16px",
            background: "linear-gradient(135deg,#ff3366,#cc0033)", color: "#fff",
            fontSize: 16, fontWeight: 900, cursor: "pointer",
            boxShadow: "0 6px 0 #990033,0 8px 24px rgba(255,51,102,0.4)"
          }}
        >
          Tengo 18 años o más
        </button>
        <a
          href="https://www.google.com"
          style={{
            display: "block", marginTop: 12, fontSize: 12, color: "#64748b", textDecoration: "none"
          }}
        >
          No tengo 18 años
        </a>
        <div style={{ fontSize: 10, color: "#475569", marginTop: 16, lineHeight: 1.5 }}>
          Si vos o alguien que conocés tiene problemas con las apuestas, recordá que la línea nacional
          <br /><strong style={{ color: "#ef4444" }}>0800-666-6006</strong> ofrece orientación gratuita y confidencial las 24 horas.
        </div>
      </div>
    </div>
  )
}
