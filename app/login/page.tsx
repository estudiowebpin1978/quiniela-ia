"use client"
import { useState, useEffect } from "react"
import { getAuth, saveAuth, isLoggedIn, clearGuest } from "@/lib/auth"
import Button3D from "@/components/ui/Button3D"
import { GlowOrbs, NeonBackground } from "@/components/ui/Effects"
import { ArgentinaFlag, SunOfMay } from "@/components/ui/ArgentinaBranding"
import { useSound } from "@/lib/sound/audio-manager"
import { useSettings } from "@/components/ui/Settings"

export default function LoginPage() {
  const [tab, setTab] = useState("in")
  const [email, setEmail] = useState("")
  const [pass, setPass] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [ok, setOk] = useState("")
  const [showReset, setShowReset] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const sound = useSound()
  const { settings } = useSettings()

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
      if (!res.ok) { setErr(data.error || "Error"); sound.error(); return }
      if (data.needsConfirmation) { setOk("Cuenta creada! Ahora iniciá sesión."); setTab("in"); setPass(""); sound.success(); return }
      saveAuth({
        access_token: data.access_token,
        refresh_token: data.refresh_token || "",
        expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
        token_type: "bearer",
        user: data.user
      })
      clearGuest()
      setOk("Bienvenido!")
      sound.win()
      setTimeout(() => { window.location.href = "/predictions" }, 400)
    } catch { setErr("Error de conexión"); sound.error() }
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
      if (!r.ok) { const d = await r.json(); setErr(d.msg || "Error al enviar email"); sound.error(); return }
      setResetSent(true); sound.success()
    } catch { setErr("Error de conexión"); sound.error() }
    finally { setBusy(false) }
  }

  return (<>
    <NeonBackground intensity={settings.particlesEnabled ? "low" : "off"} />
    <GlowOrbs />
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "20px",
      position: "relative", zIndex: 1,
    }}>

      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div className="animate-float" style={{
          width: 80, height: 80, borderRadius: 24,
          background: "linear-gradient(135deg, #ff3366, #cc0033)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 42, marginBottom: 14,
          boxShadow: "0 8px 0 #990033, 0 12px 32px rgba(255,51,102,0.4), inset 0 2px 0 rgba(255,255,255,0.2)",
        }}>📊</div>
        <span className="gradient-text" style={{
          fontSize: 38, fontWeight: 900, display: "block", letterSpacing: "-1px",
          fontFamily: "var(--font-display)",
        }}>Quiniela IA</span>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700 }}>
          ANÁLISIS ESTADÍSTICOS CON IA
        </div>
      </div>

      <div className="badge badge-green" style={{ marginBottom: 20 }}>
        <ArgentinaFlag size={14} /> 100% GRATIS · SIN TARJETA
      </div>

      {/* Card */}
      <div className="glass-card" style={{
        width: "100%", maxWidth: 360, padding: "28px 24px",
      }}>
        {/* Tabs */}
        <div style={{
          display: "flex", background: "rgba(0,0,0,0.3)", borderRadius: 14,
          padding: 5, gap: 4, marginBottom: 24,
        }}>
          {[
            { value: "in", label: "🔐 Entrar" },
            { value: "up", label: "✨ Crear cuenta" },
          ].map(t => (
            <button key={t.value} onClick={() => { sound.pop(); setTab(t.value); setErr(""); setOk("") }} style={{
              flex: 1, padding: "14px 10px", textAlign: "center", borderRadius: 10,
              border: "none", background: tab === t.value
                ? "linear-gradient(135deg, var(--brand-pink), var(--brand-pink-deep))" : "transparent",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              color: tab === t.value ? "#fff" : "var(--text-muted)",
              boxShadow: tab === t.value ? "0 4px 12px rgba(255,51,102,0.4)" : "none",
              transition: "all var(--transition-fast)",
              fontFamily: "var(--font-display)",
            }}>{t.label}</button>
          ))}
        </div>

        {/* Email */}
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, margin: "14px 0 6px" }}>Email</label>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="tu@email.com" autoComplete="email"
          className="input-field"
        />

        {/* Password */}
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, margin: "14px 0 6px" }}>Contraseña</label>
        <input
          type="password" value={pass} onChange={e => setPass(e.target.value)}
          placeholder="••••••••" onKeyDown={e => e.key === "Enter" && !busy && submit()}
          className="input-field"
        />

        {/* Forgot password */}
        {tab === "in" && !showReset && (
          <div style={{ textAlign: "right", marginTop: 8 }}>
            <button onClick={() => { sound.pop(); setShowReset(true); setErr(""); setOk("") }} style={{
              background: "none", border: "none", color: "var(--brand-pink)",
              fontSize: 12, cursor: "pointer", fontWeight: 600,
            }}>Olvidé mi contraseña</button>
          </div>
        )}

        {/* Reset form */}
        {showReset && !resetSent && (
          <div style={{
            marginTop: 12, padding: 14, borderRadius: 12,
            background: "rgba(255,107,129,0.08)", border: "1px solid rgba(255,107,129,0.15)",
          }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
              Te enviaremos un email con un enlace para restablecer tu contraseña.
            </div>
            <Button3D variant="primary" size="sm" sound="click" onClick={resetPassword} loading={busy}>
              📧 Enviar enlace de recuperación
            </Button3D>
            <button onClick={() => { setShowReset(false); setErr("") }} style={{
              background: "none", border: "none", color: "var(--text-muted)",
              fontSize: 11, cursor: "pointer", marginTop: 6, width: "100%",
            }}>Cancelar</button>
          </div>
        )}

        {resetSent && (
          <div style={{
            marginTop: 12, padding: 14, borderRadius: 12,
            background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)",
          }}>
            <div style={{ fontSize: 13, color: "var(--brand-green)", fontWeight: 600 }}>Email enviado!</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>Revisá tu casilla de correo. El enlace expira en 1 hora.</div>
            <button onClick={() => { setShowReset(false); setResetSent(false) }} style={{
              background: "none", border: "none", color: "var(--brand-pink)", fontSize: 11, cursor: "pointer", marginTop: 6,
            }}>Volver al login</button>
          </div>
        )}

        {/* Submit */}
        <div style={{ marginTop: 20 }}>
          <Button3D
            variant={tab === "up" ? "secondary" : "primary"}
            size="lg"
            glow
            sound="click"
            loading={busy}
            onClick={submit}
          >
            {tab === "in" ? "🚀 Entrar al sistema" : "🎯 Crear mi cuenta"}
          </Button3D>
        </div>

        {/* Messages */}
        {err && (
          <div style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 10, padding: "12px 14px", color: "#fca5a5", fontSize: 13, marginTop: 14,
          }}>⚠️ {err}</div>
        )}
        {ok && (
          <div style={{
            background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: 10, padding: "12px 14px", color: "#86efac", fontSize: 13, marginTop: 14,
          }}>✅ {ok}</div>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 24, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
        Al continuar aceptás nuestros{" "}
        <a href="/terminos" style={{ color: "var(--brand-pink)", textDecoration: "none", fontWeight: 600 }}>términos</a>
        {" "}y{" "}
        <a href="/privacidad" style={{ color: "var(--brand-pink)", textDecoration: "none", fontWeight: 600 }}>privacidad</a>
      </div>
    </div>
  </>)
}