"use client"
import { useEffect, useRef } from "react"

const FEATURES = [
  { i: "📊", t: "Motor de 30 factores estadísticos", s: 5 },
  { i: "🎲", t: "Simulación Monte Carlo en tiempo real", s: 5 },
  { i: "🤖", t: "Machine Learning con Random Forest", s: 5 },
  { i: "🔥", t: "Mapa de calor de frecuencias", s: 5 },
  { i: "📈", t: "Análisis de tendencias por turno", s: 5 },
  { i: "🧠", t: "Redes neuronales y Markov", s: 5 },
  { i: "⚡", t: "Resultados actualizados automáticamente", s: 5 },
  { i: "🏆", t: "Sistema de logros y gamificación", s: 5 },
  { i: "📱", t: "App progresiva (PWA) instalable", s: 5 },
  { i: "🔔", t: "Notificaciones push de resultados", s: 5 },
]

export default function ReviewsCarousel() {
  const trackRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    let pos = 0
    let raf: number

    function animate() {
      if (!track) return
      if (!pausedRef.current && document.visibilityState === "visible") {
        pos -= 0.5
        if (Math.abs(pos) >= track.scrollWidth / 2) pos = 0
        track.style.transform = `translateX(${pos}px)`
      }
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [])

  const items = [...FEATURES, ...FEATURES]

  return (
    <div style={{ marginTop: 24 }}>
      <div className="sec" style={{ padding: "0 16px" }}>Nuestras funcionalidades</div>
      <div
        className="rev-o"
        style={{ overflow: "hidden", position: "relative" }}
        onMouseEnter={() => { pausedRef.current = true }}
        onMouseLeave={() => { pausedRef.current = false }}
      >
        <div ref={trackRef} className="rev-tr" style={{ display: "flex", gap: 10, width: "max-content" }}>
          {items.map((r, i) => (
            <div key={i} style={{
              minWidth: 200, background: "rgba(255,255,255,.03)",
              border: "1px solid rgba(255,255,255,.06)",
              borderRadius: 12, padding: 12, flexShrink: 0
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, background: "linear-gradient(135deg,#a855f7,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                  {r.i}
                </div>
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.5 }}>{r.t}</div>
              <div style={{ marginTop: 4, fontSize: 10, color: "#f59e0b" }}>{"★".repeat(r.s)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
