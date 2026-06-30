"use client"
import { useEffect, useState, useRef } from "react"
import { isLoggedIn, isGuest } from "@/lib/auth"

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
    <div style={{
      width: "100%", maxWidth: 340, marginTop: 32,
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16, padding: "16px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <span>👥</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>Tendencias del Día</span>
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>
        {data.totalToday} análisis realizados hoy
      </div>
      {data.trends.filter((t: any) => t.hot_numbers?.length > 0).slice(0, 3).map((t: any, i: number) => (
        <div key={i} style={{
          marginBottom: 8, padding: "8px 10px", borderRadius: 10,
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#a855f7", marginBottom: 4 }}>
            {turnoNames[t.turno] || t.turno} · {t.analysis_count} análisis
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {t.hot_numbers.slice(0, 5).map((n: any, j: number) => (
              <span key={j} style={{
                fontSize: 11, fontWeight: 700, color: "#e2e8f0",
                background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)",
                borderRadius: 6, padding: "3px 7px",
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
  const [showPremium, setShowPremium] = useState(false)
  const carouselRef = useRef<HTMLDivElement>(null)
  const [touchStart, setTouchStart] = useState(0)

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

  if (!ready) return null

  return (<>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      body{min-height:100vh;background:#050510;font-family:'Inter',sans-serif;overflow-x:hidden}

      /* Hero */
      .hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 20px;background:radial-gradient(ellipse 100% 80% at 50% -20%,rgba(120,0,255,0.15),transparent 50%),radial-gradient(80% 60% at 80% 100%,rgba(255,0,100,0.1),transparent 50%),#050510;position:relative}
      .logo{width:100px;height:100px;background:linear-gradient(135deg,#ff3366,#ff1a53,#cc0033);border-radius:28px;display:inline-flex;align-items:center;justify-content:center;font-size:52px;margin-bottom:16px;box-shadow:0 12px 0 #990033,0 16px 40px rgba(255,51,102,0.5),inset 0 2px 0 rgba(255,255,255,0.2);transform:translateY(-6px);animation:float 3s ease-in-out infinite}
      @keyframes float{0%,100%{transform:translateY(-6px)}50%{transform:translateY(-14px)}}
      .title{font-size:44px;font-weight:900;background:linear-gradient(135deg,#ff6699,#ff3366,#cc0033);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-1px;text-align:center;margin-bottom:8px}
      .subtitle{font-size:15px;color:#94a3b8;text-align:center;max-width:340px;line-height:1.6;margin-bottom:20px}
      .subtitle strong{color:#e2e8f0}
      .badge{background:linear-gradient(135deg,rgba(34,197,94,0.2),rgba(34,197,94,0.1));border:1px solid rgba(34,197,94,0.3);color:#4ade80;font-size:12px;font-weight:700;padding:10px 18px;border-radius:20px;margin-bottom:24px;display:inline-flex;align-items:center;gap:6px}

      /* Stats row */
      .stats-row{display:flex;gap:16px;margin-bottom:28px;flex-wrap:wrap;justify-content:center}
      .stat{text-align:center}
      .stat-num{font-size:24px;font-weight:900;color:#ff3366}
      .stat-lbl{font-size:10px;color:#64748b;font-weight:600;margin-top:2px}

      /* Buttons */
      .btn-3d{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:10px;width:100%;max-width:320px;padding:18px 24px;font-size:17px;font-weight:900;color:#fff;border:none;border-radius:18px;cursor:pointer;transition:all .15s;transform:translateY(-4px);background:linear-gradient(135deg,#ff3366,#cc0033);box-shadow:0 8px 0 #990033,0 12px 32px rgba(255,51,102,0.5),inset 0 2px 0 rgba(255,255,255,0.2);text-decoration:none;font-family:inherit}
      .btn-3d:active{transform:translateY(2px);box-shadow:0 3px 0 #990033,0 4px 12px rgba(255,51,102,0.3);transition:all .05s}
      .btn-3d::after{content:'';position:absolute;inset:0;border-radius:18px;border:2px solid rgba(255,255,255,0.1);pointer-events:none}
      .btn-3d-guest{background:linear-gradient(135deg,#6366f1,#8b5cf6);box-shadow:0 8px 0 #4338ca,0 12px 32px rgba(99,102,241,0.5),inset 0 2px 0 rgba(255,255,255,0.2)}
      .btn-3d-guest:active{box-shadow:0 3px 0 #4338ca,0 4px 12px rgba(99,102,241,0.3)}
      .btn-3d-sm{padding:12px 20px;font-size:14px;max-width:260px;border-radius:14px}
      .btn-3d-outline{background:transparent;border:2px solid rgba(255,51,102,0.4);box-shadow:0 4px 16px rgba(255,51,102,0.15)}

      .divider{display:flex;align-items:center;gap:12px;width:100%;max-width:320px;margin:16px 0;color:#475569;font-size:12px;font-weight:600}
      .divider::before,.divider::after{content:'';flex:1;height:1px;background:rgba(255,255,255,0.08)}

      /* Features */
      .features{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;max-width:340px;margin-top:28px}
      .feat{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:14px 12px;text-align:center}
      .feat-icon{font-size:24px;margin-bottom:6px}
      .feat-title{font-size:12px;font-weight:700;color:#e2e8f0}
      .feat-desc{font-size:10px;color:#64748b;margin-top:2px}

      /* Screenshots */
      .screenshots{width:100%;max-width:340px;margin-top:36px}
      .screenshots h3{font-size:16px;font-weight:800;color:#e2e8f0;text-align:center;margin-bottom:16px}
      .carousel{position:relative;width:100%;aspect-ratio:9/16;max-height:420px;border-radius:20px;overflow:hidden;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)}
      .carousel img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity 0.5s ease,transform 0.5s ease}
      .carousel img.active{opacity:1;transform:scale(1)}
      .carousel img:not(.active){opacity:0;transform:scale(1.05)}
      .carousel-dots{display:flex;justify-content:center;gap:8px;margin-top:12px}
      .carousel-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.15);border:none;cursor:pointer;transition:all 0.3s}
      .carousel-dot.active{background:#ff3366;width:24px;border-radius:4px}
      .carousel-label{text-align:center;font-size:12px;color:#94a3b8;margin-top:8px;font-weight:600}

      /* Premium */
      .premium-section{width:100%;max-width:340px;margin-top:40px;background:linear-gradient(180deg,rgba(168,85,247,0.08),rgba(99,102,241,0.05));border:1px solid rgba(168,85,247,0.2);border-radius:20px;padding:28px 20px;text-align:center}
      .premium-section h3{font-size:18px;font-weight:900;color:#fff;margin-bottom:4px}
      .premium-section .tag{display:inline-block;font-size:10px;font-weight:700;color:#a855f7;background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.3);border-radius:12px;padding:4px 10px;margin-bottom:16px}
      .premium-features{text-align:left;margin:16px 0}
      .premium-feat{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
      .premium-feat:last-child{border-bottom:none}
      .premium-feat .check{color:#4ade80;font-size:14px;font-weight:900}
      .premium-feat .text{font-size:13px;color:#e2e8f0}
      .premium-price{margin:20px 0 16px}
      .premium-price .amount{font-size:36px;font-weight:900;color:#fff}
      .premium-price .period{font-size:14px;color:#94a3b8;margin-left:4px}

      /* Disclaimer */
      .disclaimer{background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.15);border-radius:8px;padding:8px 12px;margin-top:24px;max-width:340px;text-align:center}
      .disclaimer-title{font-size:10px;color:#a5b4fc;font-weight:700;margin-bottom:2px}
      .disclaimer-text{font-size:9px;color:#64748b;line-height:1.4}

      .footer-link{margin-top:24px;font-size:11px;color:#475569;text-align:center}
      .footer-link a{color:#ff6b81;text-decoration:none}
      .credit{font-size:9px;color:#334155;margin-top:12px;text-align:center}
    `}</style>
    <div className="hero">
      <div className="logo">📊</div>
      <div className="title">Quiniela IA</div>

      {/* Strong headline with benefit */}
      <div className="subtitle">
        <strong>Analizá miles de sorteos en segundos</strong> con Inteligencia Artificial. 30 factores estadísticos · Machine Learning · Monte Carlo · Datos oficiales actualizados.
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat">
          <div className="stat-num">780+</div>
          <div className="stat-lbl">SORTEOS</div>
        </div>
        <div className="stat">
          <div className="stat-num">30</div>
          <div className="stat-lbl">FACTORES</div>
        </div>
        <div className="stat">
          <div className="stat-num">5K</div>
          <div className="stat-lbl">SIMULACIONES</div>
        </div>
        <div className="stat">
          <div className="stat-num">16</div>
          <div className="stat-lbl">MOTORES</div>
        </div>
      </div>

      <div className="badge">📊 ANÁLISIS ESTADÍSTICO · NO PREDICCIÓN GARANTIZADA</div>

      {/* Buttons */}
      <button className="btn-3d btn-3d-guest" onClick={() => {
        localStorage.setItem("quiniela-ia-guest", "1")
        window.location.href = "/predictions"
      }}>
        🚀 Ingresar sin cuenta
      </button>

      <div className="divider">o</div>

      <a href="/login" className="btn-3d">
        🔐 Crear cuenta / Entrar
      </a>

      {/* Features - Results first, not technology */}
      <div className="features">
        <div className="feat">
          <div className="feat-icon">🎯</div>
          <div className="feat-title">Top 10 Números</div>
          <div className="feat-desc">Ranking por score combinado</div>
        </div>
        <div className="feat">
          <div className="feat-icon">🔥</div>
          <div className="feat-title">Mapa de Calor</div>
          <div className="feat-desc">Frecuencias 10×10 visual</div>
        </div>
        <div className="feat">
          <div className="feat-icon">🔗</div>
          <div className="feat-title">Correlaciones</div>
          <div className="feat-desc">Pares que salen juntos</div>
        </div>
        <div className="feat">
          <div className="feat-icon">📈</div>
          <div className="feat-title">Tendencias</div>
          <div className="feat-desc">Fríos, calientes y retrasos</div>
        </div>
        <div className="feat">
          <div className="feat-icon">🧬</div>
          <div className="feat-title">Ciclos</div>
          <div className="feat-desc">Frecuencia periódica</div>
        </div>
        <div className="feat">
          <div className="feat-icon">📊</div>
          <div className="feat-title">Monte Carlo</div>
          <div className="feat-desc">5.000 simulaciones</div>
        </div>
      </div>

      {/* Screenshots */}
      <div className="screenshots">
        <h3>Así se ve el análisis</h3>
        <div
          className="carousel"
          ref={carouselRef}
          onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            const diff = touchStart - e.changedTouches[0].clientX
            if (Math.abs(diff) > 50) {
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
              className={i === activeShot ? "active" : ""}
              loading="lazy"
            />
          ))}
        </div>
        <div className="carousel-dots">
          {SCREENSHOTS.map((_, i) => (
            <button key={i} className={"carousel-dot" + (i === activeShot ? " active" : "")} onClick={() => setActiveShot(i)} />
          ))}
        </div>
        <div className="carousel-label">{SCREENSHOTS[activeShot].label}</div>
      </div>

      {/* Premium section */}
      <div className="premium-section">
        <h3>⭐ Quiniela IA Premium</h3>
        <span className="tag">ANÁLISIS COMPLETO</span>
        <div className="premium-features">
          <div className="premium-feat">
            <span className="check">✅</span>
            <span className="text">Top 10 con score detallado</span>
          </div>
          <div className="premium-feat">
            <span className="check">✅</span>
            <span className="text">Números de 3 y 4 cifras</span>
          </div>
          <div className="premium-feat">
            <span className="check">✅</span>
            <span className="text">Redoblona (combinación)</span>
          </div>
          <div className="premium-feat">
            <span className="check">✅</span>
            <span className="text">Análisis por turno específico</span>
          </div>
          <div className="premium-feat">
            <span className="check">✅</span>
            <span className="text">Historial de análisis ilimitado</span>
          </div>
          <div className="premium-feat">
            <span className="check">✅</span>
            <span className="text">Comparación con resultados reales</span>
          </div>
          <div className="premium-feat">
            <span className="check">✅</span>
            <span className="text">16 motores de IA + Monte Carlo</span>
          </div>
        </div>
        <div className="premium-price">
          <span className="amount">$10.000</span>
          <span className="period">/mes</span>
        </div>
        <a href="/login" className="btn-3d btn-3d-sm" style={{margin:"0 auto"}}>
          🔓 Empezar Premium
        </a>
      </div>

      {/* Community Trends */}
      <CommunityTrends />

      {/* Disclaimer */}
      <div className="disclaimer">
        <div className="disclaimer-title">⚠️ Análisis, no predicción</div>
        <div className="disclaimer-text">Los sorteos son eventos aleatorios e independientes. Las tendencias históricas no garantizan resultados futuros. No vendemos boletos ni procesamos apuestas.</div>
      </div>

      <div className="footer-link">
        Solo mayores de 18 años. Línea de ayuda: <strong>0800-333-0062</strong>
      </div>
      <div className="credit">© 2026 Quiniela IA · Desarrollado por EstudioWebPin</div>
    </div>
  </>)
}
