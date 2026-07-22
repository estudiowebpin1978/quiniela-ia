"use client"
import { useEffect, useState, useRef } from "react"
import { isLoggedIn, isGuest } from "@/lib/auth"
import AgeGate from "@/components/AgeGate"
import Button3D from "@/components/ui/Button3D"
import { GlowOrbs, NeonBackground } from "@/components/ui/Effects"
import { ArgentinaFlag, SunOfMay, StatCard, Disclaimer } from "@/components/ui/ArgentinaBranding"
import { useSound } from "@/lib/sound/audio-manager"
import { useSettings } from "@/components/ui/Settings"

function CommunityTrends() {
  const [data, setData] = useState<{ trends: any[]; totalToday: number }>({ trends: [], totalToday: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/community")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading || data.totalToday === 0) return null

  const turnoNames: Record<string, string> = {
    previa: "Previa", primera: "Primera", matutina: "Matutina", vespertina: "Vespertina", nocturna: "Nocturna",
  }

  return (
    <div className="glass-card" style={{ width: "100%", maxWidth: 380, marginTop: 28, padding: "18px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 20 }}>👥</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>Tendencias del Día</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
        {data.totalToday} análisis realizados hoy
      </div>
      {data.trends.filter((t: any) => t.hot_numbers?.length > 0).slice(0, 3).map((t: any, i: number) => (
        <div key={i} style={{
          marginBottom: 8, padding: "10px 12px", borderRadius: 12,
          background: "var(--bg-glass)", border: "1px solid var(--border-subtle)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--brand-purple)", marginBottom: 6 }}>
            {turnoNames[t.turno] || t.turno} · {t.analysis_count} análisis
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {t.hot_numbers.slice(0, 5).map((n: any, j: number) => (
              <span key={j} style={{
                fontSize: 12, fontWeight: 700, color: "var(--text-primary)",
                background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.2)",
                borderRadius: 8, padding: "4px 10px", fontFamily: "var(--font-mono)",
              }}>{n.num}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const SCREENSHOTS = [
  { src: "/screenshots/IMG_6097.png", label: "Análisis con 30 factores + IA" },
  { src: "/screenshots/IMG_6098.png", label: "Tendencias y correlaciones" },
  { src: "/screenshots/IMG_6099.png", label: "Mis Análisis guardados" },
  { src: "/screenshots/IMG_6100.png", label: "Elegí tu sorteo" },
  { src: "/screenshots/IMG_6101.png", label: "Planes Premium" },
]

export default function Home() {
  const [ready, setReady] = useState(false)
  const [activeShot, setActiveShot] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)
  const [touchStart, setTouchStart] = useState(0)
  const sound = useSound()
  const { settings } = useSettings()

  useEffect(() => {
    if (isLoggedIn() || isGuest()) {
      window.location.href = "/predictions"
    } else {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    const iv = setInterval(() => {
      setActiveShot(p => (p + 1) % SCREENSHOTS.length)
    }, 4000)
    return () => clearInterval(iv)
  }, [])

  if (!ready) return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "24px 20px",
      background: "linear-gradient(180deg, #0a0a1a 0%, #1a0a2e 50%, #0a0a1a 100%)",
    }}>
      <div className="animate-float" style={{
        width: 100, height: 100, borderRadius: 28,
        background: "linear-gradient(135deg, #ff3366, #cc0033)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 52, marginBottom: 16,
        boxShadow: "0 12px 0 #990033, 0 16px 40px rgba(255,51,102,0.5)",
      }}>📊</div>
      <h1 className="gradient-text" style={{
        fontSize: 42, fontWeight: 900, letterSpacing: "-1px", textAlign: "center", marginBottom: 8,
        fontFamily: "var(--font-display)",
      }}>Quiniela IA</h1>
      <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 8 }}>Cargando...</div>
    </div>
  )

  return (<>
    <AgeGate />
    <NeonBackground intensity={settings.particlesEnabled ? "low" : "off"} />
    <GlowOrbs />

    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "24px 20px", position: "relative", zIndex: 1,
    }}>

      {/* Logo */}
      <div className="animate-float" style={{
        width: 100, height: 100, borderRadius: 28,
        background: "linear-gradient(135deg, #ff3366, #cc0033)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 52, marginBottom: 16,
        boxShadow: "0 12px 0 #990033, 0 16px 40px rgba(255,51,102,0.5), inset 0 2px 0 rgba(255,255,255,0.2)",
      }}>📊</div>

      {/* Title */}
      <h1 className="gradient-text" style={{
        fontSize: 42, fontWeight: 900, letterSpacing: "-1px", textAlign: "center", marginBottom: 8,
        fontFamily: "var(--font-display)",
      }}>Quiniela IA</h1>

      {/* Subtitle */}
      <p style={{
        fontSize: 15, color: "var(--text-secondary)", textAlign: "center",
        maxWidth: 340, lineHeight: 1.6, marginBottom: 20,
      }}>
        <strong style={{ color: "var(--text-primary)" }}>Analizá miles de sorteos en segundos</strong> con Inteligencia Artificial.
        30 factores estadísticos · Machine Learning · Monte Carlo · Datos oficiales.
      </p>

      {/* Badge */}
      <div className="badge badge-primary" style={{ marginBottom: 24 }}>
        <ArgentinaFlag size={16} />
        ANÁLISIS ESTADÍSTICO · NO PREDICCIÓN GARANTIZADA
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap", justifyContent: "center" }}>
        <StatCard icon="📊" value="780+" label="Sorteos" color="var(--brand-pink)" />
        <StatCard icon="🧮" value="30" label="Factores" color="var(--brand-purple)" />
        <StatCard icon="🎲" value="5K" label="Simulaciones" color="var(--brand-cyan)" />
        <StatCard icon="⚡" value="16" label="Motores" color="var(--arg-gold)" />
      </div>

      {/* Buttons */}
      <Button3D
        variant="secondary"
        size="lg"
        glow
        sound="coin"
        icon={<span>🚀</span>}
        onClick={() => {
          sound.whoosh()
          localStorage.setItem("quiniela-ia-guest", "1")
          window.location.href = "/predictions"
        }}
      >
        Ingresar sin cuenta
      </Button3D>

      <div style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        maxWidth: 320, margin: "16px 0", color: "var(--text-muted)", fontSize: 12, fontWeight: 600,
      }}>
        <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
        o
        <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
      </div>

      <Button3D
        variant="primary"
        size="lg"
        glow
        sound="click"
        icon={<span>🔐</span>}
        onClick={() => { sound.click(); window.location.href = "/login" }}
      >
        Crear cuenta / Entrar
      </Button3D>

      {/* Features */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
        width: "100%", maxWidth: 380, marginTop: 28,
      }}>
        {[
          { icon: "🎯", title: "Top 10 Números", desc: "Ranking por score combinado" },
          { icon: "🔥", title: "Mapa de Calor", desc: "Frecuencias 10×10 visual" },
          { icon: "🔗", title: "Correlaciones", desc: "Pares que salen juntos" },
          { icon: "📈", title: "Tendencias", desc: "Fríos, calientes y retrasos" },
          { icon: "🧬", title: "Ciclos", desc: "Frecuencia periódica" },
          { icon: "📊", title: "Monte Carlo", desc: "5.000 simulaciones" },
        ].map((f, i) => (
          <div key={i} className="glass-card" style={{ padding: "16px 12px", textAlign: "center", cursor: "default" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{f.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{f.title}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Screenshots */}
      <div style={{ width: "100%", maxWidth: 380, marginTop: 36 }}>
        <h3 style={{
          fontSize: 17, fontWeight: 800, color: "var(--text-primary)",
          textAlign: "center", marginBottom: 16, fontFamily: "var(--font-display)",
        }}>Así se ve el análisis</h3>
        <div
          ref={carouselRef}
          style={{
            position: "relative", width: "100%", aspectRatio: "9/16", maxHeight: 420,
            borderRadius: 20, overflow: "hidden",
            background: "var(--bg-glass)", border: "1px solid var(--border-subtle)",
          }}
          onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            const diff = touchStart - e.changedTouches[0].clientX
            if (Math.abs(diff) > 50) {
              sound.whoosh()
              setActiveShot(p => diff > 0
                ? (p + 1) % SCREENSHOTS.length
                : (p - 1 + SCREENSHOTS.length) % SCREENSHOTS.length
              )
            }
          }}
        >
          {SCREENSHOTS.map((s, i) => (
            <img
              key={i}
              src={s.src}
              alt={s.label}
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover",
                opacity: i === activeShot ? 1 : 0,
                transform: i === activeShot ? "scale(1)" : "scale(1.05)",
                transition: "opacity 0.5s ease, transform 0.5s ease",
              }}
              loading="lazy"
            />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
          {SCREENSHOTS.map((_, i) => (
            <button key={i} onClick={() => { sound.pop(); setActiveShot(i) }} style={{
              width: i === activeShot ? 24 : 8, height: 8, borderRadius: 4,
              background: i === activeShot ? "var(--brand-pink)" : "rgba(255,255,255,0.15)",
              border: "none", cursor: "pointer", transition: "all 0.3s",
            }} />
          ))}
        </div>
        <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", marginTop: 8, fontWeight: 600 }}>
          {SCREENSHOTS[activeShot].label}
        </div>
      </div>

      {/* Community Trends */}
      <CommunityTrends />

      {/* Disclaimer */}
      <Disclaimer />

      <div style={{ marginTop: 24, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
        Solo mayores de 18 años. Línea de ayuda: <strong style={{ color: "var(--brand-pink)" }}>0800-666-6006</strong>
      </div>
      <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 12, textAlign: "center" }}>
        © 2026 Quiniela IA · Desarrollado por EstudioWebPin
      </div>
    </div>
  </>)
}