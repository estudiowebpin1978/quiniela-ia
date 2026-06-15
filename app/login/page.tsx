"use client"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase-browser"

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [magicSent, setMagicSent] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [pass, setPass] = useState("")
  const [passEmail, setPassEmail] = useState("")

  useEffect(() => {
    const proj = SB_URL.split("//")[1]?.split(".")[0] || "project"
    const raw = localStorage.getItem("sb-" + proj + "-auth-token")
    if (raw) {
      try {
        const s = JSON.parse(raw)
        if (s?.access_token) { window.location.href = "/predictions"; return }
      } catch {}
    }
  }, [])

  async function sendMagicLink() {
    if (!email || !email.includes("@")) { setErr("Ingresá un email válido"); return }
    setBusy(true); setErr("")
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin + "/predictions"
      }
    })
    if (error) { setErr(error.message); setBusy(false); return }
    setMagicSent(true); setBusy(false)
  }

  async function signInWithPassword() {
    if (!passEmail || !pass) { setErr("Completá email y contraseña"); return }
    setBusy(true); setErr("")
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: passEmail.trim(), password: pass, action: "signin" })
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || "Error"); setBusy(false); return }
      const proj = SB_URL.split("//")[1]?.split(".")[0] || "project"
      localStorage.setItem("sb-" + proj + "-auth-token", JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token || "",
        expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
        token_type: "bearer",
        user: data.user
      }))
      window.location.href = "/predictions"
    } catch { setErr("Error de conexión"); setBusy(false) }
  }

  if (magicSent) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
          *{box-sizing:border-box;margin:0;padding:0}
          body{min-height:100vh;background:#050510;font-family:'Inter',sans-serif}
          .page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;background:radial-gradient(ellipse 100% 80% at 50% -20%,rgba(120,0,255,0.15),transparent 50%),radial-gradient(ellipse 80% 60% at 80% 100%,rgba(255,0,100,0.1),transparent 50%),#050510}
          .card{width:100%;max-width:360px;background:linear-gradient(180deg,rgba(20,20,40,0.95),rgba(10,10,25,0.98));border:1px solid rgba(255,255,255,.08);border-radius:28px;padding:32px 24px;text-align:center;box-shadow:0 25px 80px rgba(0,0,0,0.5)}
          .check{width:80px;height:80px;background:linear-gradient(135deg,#22c55e,#16a34a);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:40px;margin-bottom:20px;box-shadow:0 8px 32px rgba(34,197,94,0.4)}
          .title{font-size:22px;font-weight:900;color:#fff;margin-bottom:8px}
          .desc{font-size:13px;color:#94a3b8;line-height:1.6;margin-bottom:20px}
          .email-badge{background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.3);border-radius:10px;padding:10px 16px;display:inline-block;margin-bottom:20px}
          .email-badge span{color:#60a5fa;font-weight:700;font-size:14px}
          .btn{width:100%;border:none;border-radius:14px;font-size:14px;font-weight:700;padding:14px;cursor:pointer;background:rgba(255,255,255,.06);color:#94a3b8;border:1px solid rgba(255,255,255,.08);transition:all .2s}
          .btn:hover{background:rgba(255,255,255,.1);color:#fff}
          .info{font-size:11px;color:#475569;margin-top:16px;line-height:1.6}
        `}</style>
        <div className="page">
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ width: 80, height: 80, background: "linear-gradient(135deg,#ff3366,#ff1a53,#cc0033)", borderRadius: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 42, marginBottom: 14, boxShadow: "0 8px 0 #990033,0 12px 32px rgba(255,51,102,0.4)" }}>📊</div>
            <span style={{ fontSize: 38, fontWeight: 900, background: "linear-gradient(135deg,#ff6699,#ff3366,#cc0033)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: -1 }}>Quiniela IA</span>
          </div>
          <div className="card">
            <div className="check">✉️</div>
            <div className="title">Revisá tu email</div>
            <div className="desc">
              Te mandamos un link mágico a:
            </div>
            <div className="email-badge"><span>{email}</span></div>
            <div className="desc" style={{ fontSize: 12 }}>
              Hacé click en el link del email para entrar.
              <br />El link expira en 5 minutos.
            </div>
            <button className="btn" onClick={() => { setMagicSent(false); setEmail(""); setErr("") }}>
              ← Volver al login
            </button>
            <div className="info">
              ¿No recibiste el email? Revisá la carpeta de spam o intentá de nuevo.
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{min-height:100vh;background:#050510;font-family:'Inter',sans-serif}
        .page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;background:radial-gradient(ellipse 100% 80% at 50% -20%,rgba(120,0,255,0.15),transparent 50%),radial-gradient(ellipse 80% 60% at 80% 100%,rgba(255,0,100,0.1),transparent 50%),#050510}
        .logo{width:80px;height:80px;background:linear-gradient(135deg,#ff3366,#ff1a53,#cc0033);border-radius:24px;display:inline-flex;align-items:center;justify-content:center;font-size:42px;margin-bottom:14px;box-shadow:0 8px 0 #990033,0 12px 32px rgba(255,51,102,0.4),inset 0 2px 0 rgba(255,255,255,0.2);transform:translateY(-4px)}
        .app-name{font-size:38px;font-weight:900;background:linear-gradient(135deg,#ff6699,#ff3366,#cc0033);-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:block;letter-spacing:-1px;text-shadow:0 4px 20px rgba(255,51,102,0.4)}
        .card{width:100%;max-width:360px;background:linear-gradient(180deg,rgba(20,20,40,0.95),rgba(10,10,25,0.98));border:1px solid rgba(255,255,255,.08);border-radius:28px;padding:28px 24px;box-shadow:0 25px 80px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,.05)}
        .lbl{display:block;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px}
        input{width:100%;background:rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,.08);border-radius:12px;color:#fff;font-size:15px;padding:14px 16px;outline:none;transition:all .2s;font-family:inherit}
        input:focus{border-color:#ff3366;background:rgba(255,51,102,0.08);box-shadow:0 0 20px rgba(255,51,102,0.15)}
        input::placeholder{color:#475569}
        .btn-main{width:100%;border:none;border-radius:14px;font-size:16px;font-weight:900;padding:16px;cursor:pointer;margin-top:20px;background:linear-gradient(135deg,#ff3366,#cc0033);color:#fff;box-shadow:0 6px 0 #990033,0 8px 24px rgba(255,51,102,0.4),inset 0 2px 0 rgba(255,255,255,0.2);transition:all .15s}
        .btn-main:active{transform:translateY(3px);box-shadow:0 3px 0 #990033,0 4px 12px rgba(255,51,102,0.3)}
        .btn-main:disabled{opacity:.5;cursor:not-allowed}
        .btn-pass{width:100%;border:none;border-radius:12px;font-size:13px;font-weight:600;padding:12px;cursor:pointer;background:rgba(255,255,255,.04);color:#64748b;border:1px solid rgba(255,255,255,.06);transition:all .2s;margin-top:12px}
        .btn-pass:hover{background:rgba(255,255,255,.08);color:#94a3b8}
        .btn-pass.on{background:rgba(255,51,102,.08);color:#ff6b81;border-color:rgba(255,51,102,.2)}
        .err{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:12px 14px;color:#fca5a5;font-size:13px;margin-top:14px}
        .badge{background:linear-gradient(135deg,rgba(34,197,94,0.2),rgba(34,197,94,0.1));border:1px solid rgba(34,197,94,0.3);color:#4ade80;font-size:12px;font-weight:700;padding:10px 16px;border-radius:20px;margin-bottom:20px;display:inline-flex;align-items:center;gap:6px}
        .magic-box{background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.25);border-radius:16px;padding:20px;text-align:center;margin-bottom:16px}
        .magic-title{font-size:15px;font-weight:800;color:#c4b5fd;margin-bottom:4}
        .magic-desc{font-size:11px;color:#94a3b8;line-height:1.5}
        .divider{display:flex;align-items:center;gap:12px;margin:16px 0;color:#475569;font-size:12px;font-weight:600}
        .divider::before,.divider::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.08)}
        .pass-section{max-height:0;overflow:hidden;transition:max-height .3s ease}
        .pass-section.open{max-height:300px}
      `}</style>
      <div className="page">
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div className="logo">📊</div>
          <span className="app-name">Quiniela IA</span>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 8, letterSpacing: 1 }}>ANÁLISIS ESTADÍSTICOS CON IA</div>
        </div>

        <div className="badge">✅ 100% GRATIS · SIN TARJETA</div>

        <div className="card">
          <div className="magic-box">
            <div className="magic-title">🔑 Entrá con un solo click</div>
            <div className="magic-desc">Te mandamos un link mágico a tu email. Sin contraseña.</div>
          </div>

          <span className="lbl">Tu email</span>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@email.com"
            autoComplete="email"
            onKeyDown={e => e.key === "Enter" && !busy && sendMagicLink()}
          />

          <button className="btn-main" onClick={sendMagicLink} disabled={busy}>
            {busy ? "⏳ Enviando..." : "✉️ Enviar link mágico"}
          </button>

          {err && <div className="err">⚠️ {err}</div>}

          <div className="divider">o entrá con contraseña</div>

          <button
            className={"btn-pass" + (showPassword ? " on" : "")}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? "▲ Ocultar contraseña" : "🔐 Tengo contraseña"}
          </button>

          <div className={"pass-section" + (showPassword ? " open" : "")}>
            <div style={{ paddingTop: 12 }}>
              <span className="lbl">Email</span>
              <input
                type="email"
                value={passEmail}
                onChange={e => setPassEmail(e.target.value)}
                placeholder="tu@email.com"
                autoComplete="email"
              />
              <span className="lbl">Contraseña</span>
              <input
                type="password"
                value={pass}
                onChange={e => setPass(e.target.value)}
                placeholder="••••••••"
                onKeyDown={e => e.key === "Enter" && !busy && signInWithPassword()}
              />
              <button className="btn-main" onClick={signInWithPassword} disabled={busy} style={{ marginTop: 12, fontSize: 14, padding: 14 }}>
                {busy ? "⏳ Entrando..." : "🚀 Entrar"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, fontSize: 11, color: "#475569", textAlign: "center" }}>
          Al continuar aceptás nuestros <a href="/privacidad" style={{ color: "#ff6b81" }}>términos y privacidad</a>
        </div>
      </div>
    </>
  )
}
