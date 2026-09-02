/**
 * OG Image endpoint for sharing predictions.
 * Generates a dynamic Open Graph image for social media sharing.
 * 
 * Usage: /api/og/acierto?turno=nocturna&numeros=05,12,34,56,78&confidence=85
 */

import { NextRequest } from "next/server"
import { ImageResponse } from "next/og"
import { SUENOS } from "@/lib/suenos"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const turno = searchParams.get("turno") || "Nocturna"
  const numeros = searchParams.get("numeros")?.split(",").slice(0, 5) || ["05", "12", "34", "56", "78"]
  const confidence = parseInt(searchParams.get("confidence") || "85")
  const date = searchParams.get("date") || new Date().toLocaleDateString("es-AR")

  // Parse numbers and get sueños
  const numeroData = numeros.map(n => {
    const num = parseInt(n)
    const sueno = SUENOS[num] || { emoji: "❓", nombre: "Desconocido" }
    return { num, emoji: sueno.emoji, nombre: sueno.nombre }
  })

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0f172a",
          fontFamily: "system-ui, sans-serif",
          padding: "40px",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "20px",
          }}
        >
          <span style={{ fontSize: "48px", marginRight: "16px" }}>🎱</span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "32px", fontWeight: "bold", color: "#f8fafc" }}>
              Quiniela IA
            </span>
            <span style={{ fontSize: "18px", color: "#94a3b8" }}>
              Predicción Inteligente
            </span>
          </div>
        </div>

        {/* Turno badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#3b82f6",
            borderRadius: "9999px",
            padding: "8px 24px",
            marginBottom: "32px",
          }}
        >
          <span style={{ fontSize: "20px", fontWeight: "bold", color: "#ffffff" }}>
            {turno.toUpperCase()}
          </span>
        </div>

        {/* Numbers grid */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
            marginBottom: "32px",
          }}
        >
          {numeroData.map((n, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                backgroundColor: "#1e293b",
                borderRadius: "12px",
                padding: "16px 32px",
                minWidth: "400px",
              }}
            >
              <span style={{ fontSize: "36px" }}>{n.emoji}</span>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "28px", fontWeight: "bold", color: "#f8fafc" }}>
                  {String(n.num).padStart(2, "0")}
                </span>
                <span style={{ fontSize: "16px", color: "#94a3b8" }}>{n.nombre}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            maxWidth: "500px",
          }}
        >
          <span style={{ fontSize: "16px", color: "#64748b" }}>{date}</span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: confidence >= 80 ? "#22c55e" : confidence >= 60 ? "#eab308" : "#ef4444",
              borderRadius: "9999px",
              padding: "6px 16px",
            }}
          >
            <span style={{ fontSize: "14px", fontWeight: "bold", color: "#ffffff" }}>
              {confidence}% confianza
            </span>
          </div>
        </div>

        {/* Branding */}
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            right: "20px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span style={{ fontSize: "14px", color: "#475569" }}>Generado por IA</span>
          <span style={{ fontSize: "14px", color: "#3b82f6" }}>quiniela-ia.com</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
