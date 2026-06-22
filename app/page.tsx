"use client"
import { useEffect, useState } from "react"
import { isLoggedIn, isGuest } from "@/lib/auth"

export default function Home() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (isLoggedIn() || isGuest()) {
      window.location.href = "/predictions"
    } else {
      setReady(true)
    }
  }, [])

  if (!ready) return null

  return (<>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      body{min-height:100vh;background:#050510;font-family:'Inter',sans-serif;overflow-x:hidden}
      .hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 20px;background:radial-gradient(ellipse 100% 80% at 50% -20%,rgba(120,0,255,0.15),transparent 50%),radial-gradient(ellipse 80% 60% at 80% 100%,rgba(255,0,100,0.1),transparent 50%),#050510;position:relative}
      .logo{width:100px;height:100px;background:linear-gradient(135deg,#ff3366,#ff1a53,#cc0033);border-radius:28px;display:inline-flex;align-items:center;justify-content:center;font-size:52px;margin-bottom:16px;box-shadow:0 12px 0 #990033,0 16px 40px rgba(255,51,102,0.5),inset 0 2px 0 rgba(255,255,255,0.2);transform:translateY(-6px);animation:float 3s ease-in-out infinite}
      @keyframes float{0%,100%{transform:translateY(-6px)}50%{transform:translateY(-14px)}}
      .title{font-size:44px;font-weight:900;background:linear-gradient(135deg,#ff6699,#ff3366,#cc0033);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-1px;text-align:center;margin-bottom:8px}
      .subtitle{font-size:15px;color:#94a3b8;text-align:center;max-width:340px;line-height:1.6;margin-bottom:36px}
      .badge{background:linear-gradient(135deg,rgba(34,197,94,0.2),rgba(34,197,94,0.1));border:1px solid rgba(34,197,94,0.3);color:#4ade80;font-size:12px;font-weight:700;padding:10px 18px;border-radius:20px;margin-bottom:32px;display:inline-flex;align-items:center;gap:6px}

      /* 3D Button */
      .btn-3d{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:10px;width:100%;max-width:320px;padding:18px 24px;font-size:17px;font-weight:900;color:#fff;border:none;border-radius:18px;cursor:pointer;transition:all .15s;transform:translateY(-4px);background:linear-gradient(135deg,#ff3366,#cc0033);box-shadow:0 8px 0 #990033,0 12px 32px rgba(255,51,102,0.5),inset 0 2px 0 rgba(255,255,255,0.2);text-decoration:none;font-family:inherit}
      .btn-3d:active{transform:translateY(2px);box-shadow:0 3px 0 #990033,0 4px 12px rgba(255,51,102,0.3);transition:all .05s}
      .btn-3d::after{content:'';position:absolute;inset:0;border-radius:18px;border:2px solid rgba(255,255,255,0.1);pointer-events:none}

      .btn-3d-guest{background:linear-gradient(135deg,#6366f1,#8b5cf6);box-shadow:0 8px 0 #4338ca,0 12px 32px rgba(99,102,241,0.5),inset 0 2px 0 rgba(255,255,255,0.2)}
      .btn-3d-guest:active{box-shadow:0 3px 0 #4338ca,0 4px 12px rgba(99,102,241,0.3)}

      .divider{display:flex;align-items:center;gap:12px;width:100%;max-width:320px;margin:20px 0;color:#475569;font-size:12px;font-weight:600}
      .divider::before,.divider::after{content:'';flex:1;height:1px;background:rgba(255,255,255,0.08)}

      .features{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;max-width:340px;margin-top:32px}
      .feat{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:14px 12px;text-align:center}
      .feat-icon{font-size:24px;margin-bottom:6px}
      .feat-title{font-size:12px;font-weight:700;color:#e2e8f0}
      .feat-desc{font-size:10px;color:#64748b;margin-top:2px}

      .footer-link{margin-top:28px;font-size:11px;color:#475569;text-align:center}
      .footer-link a{color:#ff6b81;text-decoration:none}
      .credit{font-size:9px;color:#334155;margin-top:12px;text-align:center}
    `}</style>
    <div className="hero">
      <div className="logo">📊</div>
      <div className="title">Quiniela IA</div>
      <div className="subtitle">
        Motor de análisis estadístico con <strong style={{color:"#a855f7"}}>30 factores</strong>, <strong style={{color:"#a855f7"}}>Machine Learning</strong> y <strong style={{color:"#a855f7"}}>Monte Carlo</strong> para la Quiniela Nacional.
      </div>

      <div className="badge">✅ 100% GRATIS · DATOS REALES</div>

      {/* 3D Button - Ingresar sin cuenta */}
      <button className="btn-3d btn-3d-guest" onClick={() => {
        localStorage.setItem("quiniela-ia-guest", "1")
        window.location.href = "/predictions"
      }}>
        🚀 Ingresar sin cuenta
      </button>

      <div className="divider">o</div>

      {/* 3D Button - Crear cuenta */}
      <a href="/login" className="btn-3d">
        🔐 Crear cuenta / Entrar
      </a>

      <div className="features">
        <div className="feat">
          <div className="feat-icon">📈</div>
          <div className="feat-title">30 Factores</div>
          <div className="feat-desc">Motor estadístico completo</div>
        </div>
        <div className="feat">
          <div className="feat-icon">🎰</div>
          <div className="feat-title">Monte Carlo</div>
          <div className="feat-desc">5.000 simulaciones</div>
        </div>
        <div className="feat">
          <div className="feat-icon">🧠</div>
          <div className="feat-title">ML Ensemble</div>
          <div className="feat-desc">LightGBM + XGBoost + LSTM</div>
        </div>
        <div className="feat">
          <div className="feat-icon">📊</div>
          <div className="feat-title">Datos Reales</div>
          <div className="feat-desc">780+ sorteos históricos</div>
        </div>
      </div>

      <div className="footer-link">
        Solo mayores de 18 años. Línea de ayuda: <strong>0800-333-0062</strong>
      </div>
      <div className="credit">© 2026 Quiniela IA · Desarrollado por EstudioWebPin</div>
    </div>
  </>)
}
