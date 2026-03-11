"use client";
import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

const S = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0a0806;color:#e8dcc8;font-family:'Barlow Condensed',sans-serif}
  .page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#120f0a;border:1px solid rgba(201,168,76,.18);padding:48px 40px;width:100%;max-width:400px}
  h2{font-family:'Playfair Display',serif;font-size:28px;font-weight:900;background:linear-gradient(135deg,#f0cc6e,#c9a84c,#7a6430);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
  .sub{font-family:'DM Mono',monospace;font-size:11px;color:#8a7c6a;letter-spacing:2px;margin-bottom:32px}
  label{display:block;font-size:11px;letter-spacing:3px;color:#7a6430;text-transform:uppercase;margin-bottom:6px;margin-top:20px}
  input{width:100%;background:#1c1610;border:1px solid rgba(201,168,76,.18);color:#e8dcc8;font-family:'Barlow Condensed',sans-serif;font-size:16px;padding:12px 14px;outline:none;letter-spacing:1px}
  input:focus{border-color:#c9a84c}
  .btn{width:100%;background:#c9a84c;color:#0a0806;border:none;font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:700;letter-spacing:3px;padding:14px;cursor:pointer;text-transform:uppercase;margin-top:28px;transition:background .2s}
  .btn:hover{background:#f0cc6e}
  .btn:disabled{opacity:.5;cursor:not-allowed}
  .err{background:rgba(201,68,68,.1);border:1px solid rgba(201,68,68,.3);padding:12px;color:#e87;font-family:'DM Mono',monospace;font-size:12px;margin-top:16px}
  .ok{background:rgba(76,201,68,.1);border:1px solid rgba(76,201,68,.3);padding:12px;color:#7e8;font-family:'DM Mono',monospace;font-size:12px;margin-top:16px}
  .link{display:block;text-align:center;margin-top:20px;font-family:'DM Mono',monospace;font-size:11px;color:#7a6430;letter-spacing:2px}
  .link a{color:#c9a84c;text-decoration:none}
  .link a:hover{color:#f0cc6e}
`;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleLogin = async () => {
    setLoading(true); setError(""); setSuccess("");
    const sb = getSupabaseBrowser();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); }
    else { setSuccess("¡Bienvenido! Redirigiendo..."); setTimeout(() => window.location.href = "/predictions", 1000); }
    setLoading(false);
  };

  return (
    <>
      <style>{S}</style>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@900&family=DM+Mono:wght@400&family=Barlow+Condensed:wght@400;700&display=swap" rel="stylesheet" />
      <div className="page">
        <div className="card">
          <h2>Quiniela IA</h2>
          <div className="sub">Iniciá sesión para acceder</div>
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" />
          <label>Contraseña</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
            onKeyDown={e => e.key === "Enter" && handleLogin()} />
          <button className="btn" onClick={handleLogin} disabled={loading || !email || !password}>
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
          {error && <div className="err">⚠ {error}</div>}
          {success && <div className="ok">✓ {success}</div>}
          <div className="link">¿No tenés cuenta? <a href="/register">Registrarse</a></div>
          <div className="link"><a href="/predictions">Continuar sin cuenta →</a></div>
        </div>
      </div>
    </>
  );
}
