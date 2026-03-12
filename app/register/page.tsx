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

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleRegister = async () => {
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres"); return; }
    setLoading(true); setError(""); setSuccess("");
    const sb = getSupabaseBrowser();
    const { error } = await sb.auth.signUp({ email, password });
    if (error) { setError(error.message); }
    else { setSuccess("¡Cuenta creada! Revisá tu email para confirmar y luego iniciá sesión."); }
    setLoading(false);
  };

  return (
    <>
      <style>{S}</style>
      {/* Fonts cargadas en layout.tsx */}
      <div className="page">
        <div className="card">
          <h2>Crear cuenta</h2>
          <div className="sub">Registrate para acceder a predicciones premium</div>
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" />
          <label>Contraseña</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres"
            onKeyDown={e => e.key === "Enter" && handleRegister()} />
          <button className="btn" onClick={handleRegister} disabled={loading || !email || !password}>
            {loading ? "Creando cuenta..." : "Crear cuenta"}
          </button>
          {error && <div className="err">⚠ {error}</div>}
          {success && <div className="ok">✓ {success}</div>}
          <div className="link">¿Ya tenés cuenta? <a href="/login">Iniciá sesión</a></div>
        </div>
      </div>
    </>
  );
}
