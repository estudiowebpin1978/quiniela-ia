"use client"
import { useRef, useState } from "react"
import { triggerHaptic } from "@/lib/haptics"

interface WinCardData {
  date: string
  turno: string
  hitCount: number
  totalNumbers: number
  hitNumbers: string[]
  nivel?: number
  racha?: number
}

interface Props {
  data: WinCardData
  onClose: () => void
}

export default function WinShareCard({ data, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)

  const turnoEmoji: Record<string, string> = {
    Previa: "🌅", Primera: "☀️", Matutina: "🌤️", Vespertina: "🌇", Nocturna: "🌙",
  }

  const generateCard = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d")!
    const w = 600, h = 315
    canvas.width = w
    canvas.height = h

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, w, h)
    grad.addColorStop(0, "#0f0f1a")
    grad.addColorStop(1, "#1a0a2e")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // Accent line
    ctx.fillStyle = "#ff3366"
    ctx.fillRect(0, 0, w, 4)

    // Glow orb
    ctx.beginPath()
    ctx.arc(w - 80, 60, 120, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(255,51,102,0.08)"
    ctx.fill()

    // Trophy
    ctx.font = "48px serif"
    ctx.fillText("🏆", 30, 70)

    // Title
    ctx.font = "bold 28px sans-serif"
    ctx.fillStyle = "#ffffff"
    ctx.fillText(`${data.hitCount} ACIERTO${data.hitCount > 1 ? "S" : ""}`, 90, 58)

    // Subtitle
    ctx.font = "16px sans-serif"
    ctx.fillStyle = "#94a3b8"
    ctx.fillText(`${turnoEmoji[data.turno] || "🎱"} ${data.turno} — ${formatDate(data.date)}`, 90, 82)

    // Divider
    ctx.fillStyle = "rgba(255,255,255,0.08)"
    ctx.fillRect(30, 100, w - 60, 1)

    // Hit numbers
    const startX = 30
    const startY = 135
    ctx.font = "bold 22px monospace"
    data.hitNumbers.forEach((num, i) => {
      const x = startX + (i % 10) * 55
      const y = startY + Math.floor(i / 10) * 45
      // Circle bg
      ctx.beginPath()
      ctx.arc(x + 18, y - 6, 20, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(34,197,94,0.2)"
      ctx.fill()
      ctx.strokeStyle = "#22c55e"
      ctx.lineWidth = 2
      ctx.stroke()
      // Number
      ctx.fillStyle = "#4ade80"
      ctx.textAlign = "center"
      ctx.fillText(num, x + 18, y)
      ctx.textAlign = "start"
    })

    // Stats bar
    const statsY = 250
    ctx.fillStyle = "rgba(255,255,255,0.05)"
    ctx.fillRect(30, statsY - 10, w - 60, 40)

    ctx.font = "bold 13px sans-serif"
    ctx.fillStyle = "#a855f7"
    ctx.fillText(`⚡ Nv.${data.nivel || "?"}`, 50, statsY + 12)

    if (data.racha && data.racha > 0) {
      ctx.fillStyle = "#ff6b35"
      ctx.fillText(`🔥 ${data.racha} días`, 140, statsY + 12)
    }

    ctx.fillStyle = "#94a3b8"
    ctx.font = "13px sans-serif"
    ctx.textAlign = "right"
    ctx.fillText("Quiniela IA — Predicciones con IA", w - 50, statsY + 12)
    ctx.textAlign = "start"
  }

  const formatDate = (d: string) => {
    const [y, m, day] = d.split("-")
    return `${day}/${m}/${y}`
  }

  const handleDownload = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setDownloading(true)
    triggerHaptic("medium")
    generateCard(canvas)
    try {
      const link = document.createElement("a")
      link.download = `quiniela-ia-${data.date}-${data.turno}.png`
      link.href = canvas.toDataURL("image/png")
      link.click()
    } catch { /* silent */ }
    setTimeout(() => setDownloading(false), 1000)
  }

  const handleShare = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    triggerHaptic("medium")
    generateCard(canvas)

    const text = `🏆 ¡${data.hitCount} acierto${data.hitCount > 1 ? "s" : ""} en ${data.turno}! 🎱 Quiniela IA — Predicciones con IA`

    if (navigator.share) {
      try {
        canvas.toBlob(async (blob) => {
          if (!blob) return
          const file = new File([blob], "quiniela-win.png", { type: "image/png" })
          await navigator.share({ title: "Quiniela IA", text, files: [file] })
        })
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      triggerHaptic("success")
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,.8)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "rgba(15,15,25,.98)", borderRadius: 16, padding: 20,
        border: "1px solid rgba(255,51,102,.2)", maxWidth: 640, width: "100%",
      }}>
        <canvas ref={canvasRef} style={{ width: "100%", borderRadius: 10, marginBottom: 14 }} />

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={handleDownload} disabled={downloading} style={{
            padding: "10px 20px", borderRadius: 10, border: "none",
            background: "linear-gradient(135deg, #ff3366, #ff6b81)",
            color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
            fontFamily: "inherit",
          }}>
            {downloading ? "Descargando..." : "📥 Descargar"}
          </button>
          <button onClick={handleShare} style={{
            padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(37,244,238,.3)",
            background: "transparent", color: "#25F4EE", fontWeight: 700,
            fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}>
            {copied ? "✅ Copiado" : "📤 Compartir"}
          </button>
          <button onClick={onClose} style={{
            padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,.1)",
            background: "transparent", color: "#94a3b8", fontWeight: 700,
            fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
