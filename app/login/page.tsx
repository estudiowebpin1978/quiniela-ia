"use client"
import { useState, useEffect } from "react"
import { getAuth, saveAuth, isLoggedIn, clearGuest } from "@/lib/auth"

export default function LoginPage() {
  const [tab, setTab] = useState("in")
  const [email, setEmail] = useState("")
  const [pass, setPass] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [ok, setOk] = useState("")
  const [showReset, setShowReset] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  useEffect(() => {
    if (isLoggedIn()) window.location.href = "/predictions"
  }, [])

  async function submit() {
    if (!email || !pass) { setErr("Completa todos los campos"); return }
    setBusy(true); setErr(""); setOk("")
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: pass, action: tab === "up" ? "signup" : "signin" })
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || "Error"); return }
      if (data.needsConfirmation) { setOk("Cuenta creada! Ahora iniciá sesión."); setTab("in"); setPass(""); return }
      saveAuth({
        access_token: data.access_token,
        refresh_token: data.refresh_token || "",
        expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
        token_type: "bearer",
        user: data.user
      })
      clearGuest()
      setOk("Bienvenido!")
      setTimeout(() => { window.location.href = "/predictions" }, 400)
    } catch { setErr("Error de conexión") }
    finally { setBusy(false) }
  }

  async function resetPassword() {
    if (!email) { setErr("Ingresá tu email primero"); return }
    setBusy(true); setErr(""); setOk("")
    try {
      const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
      const SB_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").replace(/"/g, "").trim()
      const r = await fetch(`${SB_URL}/auth/v1/magiclink`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SB_KEY },
        body: JSON.stringify({ email: email.trim(), redirect_to: `${window.location.origin}/login` })
      })
      if (!r.ok) { const d = await r.json(); setErr(d.msg || "Error al enviar email"); return }
      setResetSent(true)
    } catch { setErr("Error de conexión") }
    finally { setBusy(false) }
  }

  return (<>
    <style>{`
      *{box-sizing:border-box;margin:0;padding:0}
      body{min-height:100vh;background:#050510;font-family:'Inter',sans-serif}
      .page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;background:radial-gradient(ellipse 100% 80% at 50% -20%,rgba(120,0,255,0.15),transparent 50%),radial-gradient(ellipse 80% 60% at 80% 100%,rgba(255,0,100,0.1),transparent 50%),#050510}
      .logo{width:80px;height:80px;background:linear-gradient(135deg,#ff3366,#ff1a53,#cc0033);border-radius:24px;display:inline-flex;align-items:center;justify-content:center;font-size:42px;margin-bottom:14px;box-shadow:0 8px 0 #990033,0 12px 32px rgba(255,51,102,0.4),inset 0 2px 0 rgba(255,255,255,0.2);transform:translateY(-4px)}
      .app-name{font-size:38px;font-weight:900;background:linear-gradient(135deg,#ff6699,#ff3366,#cc0033);-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:block;letter-spacing:-1px;text-shadow:0 4px 20px rgba(255,51,102,0.4)}
      .card{width:100%;max-width:360px;background:linear-gradient(180deg,rgba(20,20,40,0.95),rgba(10,10,25,0.98));border:1px solid rgba(255,255,255,.08);border-radius:28px;padding:28px 24px;box-shadow:0 25px 80px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,.05)}
      .tabs{display:flex;background:rgba(0,0,0,0.3);border-radius:14px;padding:5px;margin-bottom:24px;gap:4px}
      .tab{flex:1;padding:14px 10px;text-align:center;border-radius:10px;border:none;background:transparent;font-size:13px;font-weight:700;cursor:pointer;color:#64748b;transition:all .2s}
      .tab.on{background:linear-gradient(135deg,#ff3366,#cc0033);color:#fff;box-shadow:0 4px 12px rgba(255,51,102,0.4)}
      .lbl{display:block;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px}
      input{width:100%;background:rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,.08);border-radius:12px;color:#fff;font-size:15px;padding:14px 16px;outline:none;transition:all .2s;font-family:inherit}
      input:focus{border-color:#ff3366;background:rgba(255,51,102,0.08);box-shadow:0 0 20px rgba(255,51,102,0.15)}
      input::placeholder{color:#475569}
      .btn{width:100%;border:none;border-radius:14px;font-size:16px;font-weight:900;padding:16px;cursor:pointer;margin-top:20px;background:linear-gradient(135deg,#ff3366,#cc0033);color:#fff;box-shadow:0 6px 0 #990033,0 8px 24px rgba(255,51,102,0.4),inset 0 2px 0 rgba(255,255,255,0.2);transition:all .15s;touch-action:manipulation}
      .btn:active{transform:translateY(3px);box-shadow:0 3px 0 #990033,0 4px 12px rgba(255,51,102,0.3)}
      .btn-up{background:linear-gradient(135deg,#22c55e,#16a34a);box-shadow:0 6px 0 #166534,0 8px 24px rgba(34,197,94,0.3),inset 0 2px 0 rgba(255,255,255,0.2)}
      .btn:disabled{opacity:.5;cursor:not-allowed}
      .err{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:12px 14px;color:#fca5a5;font-size:13px;margin-top:14px}
      .suc{background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);border-radius:10px;padding:12px 14px;color:#86efac;font-size:13px;margin-top:14px}
      .badge{background:linear-gradient(135deg,rgba(34,197,94,0.2),rgba(34,197,94,0.1));border:1px solid rgba(34,197,94,0.3);color:#4ade80;font-size:12px;font-weight:700;padding:10px 16px;border-radius:20px;margin-bottom:20px;display:inline-flex;align-items:center;gap:6px}
    `}</style>
    <div className="page">
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div className="logo">📊</div>
        <span className="app-name">Quiniela IA</span>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 8, letterSpacing: 1 }}>ANÁLISIS ESTADÍSTICOS CON IA</div>
      </div>

      <div className="badge">✅ 100% GRATIS · SIN TARJETA</div>

      <div className="card">
        <div className="tabs">
          <button className={"tab" + (tab === "in" ? " on" : "")} onClick={() => { setTab("in"); setErr(""); setOk("") }}>🔐 Entrar</button>
          <button className={"tab" + (tab === "up" ? " on" : "")} onClick={() => { setTab("up"); setErr(""); setOk("") }}>✨ Crear cuenta</button>
        </div>

        <span className="lbl">Email</span>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" autoComplete="email" />

        <span className="lbl">Contraseña</span>
        <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && !busy && submit()} />

        {tab === "in" && !showReset && (
          <div style={{ textAlign: "right", marginTop: 8 }}>
            <button onClick={() => { setShowReset(true); setErr(""); setOk("") }} style={{ background: "none", border: "none", color: "#ff6b81", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              Olvidé mi contraseña
            </button>
          </div>
        )}

        {showReset && !resetSent && (
          <div style={{ marginTop: 12, padding: 14, background: "rgba(255,107,129,0.08)", borderRadius: 12, border: "1px solid rgba(255,107,129,0.15)" }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
              Te enviaremos un email con un enlace para restablecer tu contraseña.
            </div>
            <button onClick={resetPassword} disabled={busy} className="btn" style={{ marginTop: 0, padding: "10px 16px", fontSize: 13 }}>
              {busy ? "⏳ Enviando..." : "📧 Enviar enlace de recuperación"}
            </button>
            <button onClick={() => { setShowReset(false); setErr("") }} style={{ background: "none", border: "none", color: "#64748b", fontSize: 11, cursor: "pointer", marginTop: 6, width: "100%" }}>
              Cancelar
            </button>
          </div>
        )}

        {resetSent && (
          <div style={{ marginTop: 12, padding: 14, background: "rgba(34,197,94,0.08)", borderRadius: 12, border: "1px solid rgba(34,197,94,0.15)" }}>
            <div style={{ fontSize: 13, color: "#86efac", fontWeight: 600 }}>Email enviado!</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Revisá tu casilla de correo. El enlace expira en 1 hora.</div>
            <button onClick={() => { setShowReset(false); setResetSent(false) }} style={{ background: "none", border: "none", color: "#ff6b81", fontSize: 11, cursor: "pointer", marginTop: 6 }}>
              Volver al login
            </button>
          </div>
        )}

        <button className={"btn " + (tab === "up" ? "btn-up" : "")} onClick={submit} disabled={busy}>
          {busy ? "⏳ Procesando..." : tab === "in" ? "🚀 Entrar al sistema" : "🎯 Crear mi cuenta"}
        </button>

        {err && <div className="err">⚠️ {err}</div>}
        {ok && <div className="suc">✅ {ok}</div>}
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: "#475569", textAlign: "center" }}>
        Al continuar aceptás nuestros <a href="/terminos" style={{ color: "#ff6b81" }}>términos</a> y <a href="/privacidad" style={{ color: "#ff6b81" }}>privacidad</a>
      </div>
    </div>
  </>)
}
