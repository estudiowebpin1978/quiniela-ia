"use client"
import { useEffect, useRef, useCallback } from "react"

const REVIEWS = [
  { n: "Usuario #1847", t: "El motor estadístico es muy completo y detallado.", s: 5 },
  { n: "Usuario #2391", t: "Los datos se actualizan rápido y son confiables.", s: 5 },
  { n: "Usuario #956", t: "El análisis de pares correlacionados es muy útil.", s: 5 },
  { n: "Usuario #3102", t: "Fácil de usar. Muy intuitiva.", s: 4 },
  { n: "Usuario #784", t: "El mapa de calor es muy profesional.", s: 5 },
  { n: "Usuario #2615", t: "Excelente app. Los gráficos son claros.", s: 5 },
  { n: "Usuario #1203", t: "Me ayudó a entender los patrones de datos.", s: 4 },
  { n: "Usuario #4028", t: "Muy buena app, la recomiendo.", s: 5 },
  { n: "Usuario #571", t: "Los análisis de 4 cifras son muy detallados.", s: 5 },
  { n: "Usuario #3489", t: "El análisis de frecuencia cambió mi forma de ver los datos.", s: 5 },
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

  const items = [...REVIEWS, ...REVIEWS]

  return (
    <div style={{ marginTop: 24 }}>
      <div className="sec" style={{ padding: "0 16px" }}>Lo que dicen nuestros usuarios</div>
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
                <div style={{ width: 28, height: 28, borderRadius: 14, background: "linear-gradient(135deg,#a855f7,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>
                  U
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>{r.n}</div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.5 }}>{r.t}</div>
              <div style={{ marginTop: 4, fontSize: 10, color: "#f59e0b" }}>{"★".repeat(r.s)}{"☆".repeat(5 - r.s)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
