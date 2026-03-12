"use client";
import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

const UALA_LINK = "https://pagar.ualabis.com.ar/order/df50920d5961bd85d19f4231747cc5d7e6ca0489da6e76a4";

export default function LoginPage() {
  const [tab, setTab] = useState<"login"|"register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handle = async () => {
    if (!email || !password) { setError("Completá todos los campos"); return; }
    if (tab === "register" && password.length < 6) { setError("Mínimo 6 caracteres"); return; }
    setLoading(true); setError(""); setSuccess("");
    const sb = getSupabaseBrowser();
    if (tab === "login") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setError(error.message === "Invalid login credentials" ? "Email o contraseña incorrectos" : error.message);
      else { setSuccess("¡Bienvenido!"); setTimeout(() => window.location.href = "/predictions", 800); }
    } else {
      const { error } = await sb.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setSuccess("¡Cuenta creada! Revisá tu email para confirmar.");
    }
    setLoading(false);
  };

  return (
    <>
      <style>{`
        /* Fonts cargadas en layout.tsx */
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%;background:#06080f}
        .bg{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
          background:radial-gradient(ellipse 80% 60% at 50% -10%,rgba(99,102,241,.15) 0%,transparent 70%),
          radial-gradient(ellipse 60% 40% at 100% 100%,rgba(201,168,76,.08) 0%,transparent 60%),#06080f}
        .card{width:100%;max-width:420px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);
          border-radius:24px;padding:40px 36px;backdrop-filter:blur(20px);
          box-shadow:0 25px 60px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06)}
        .logo{text-align:center;margin-bottom:32px}
        .logo-icon{width:52px;height:52px;background:linear-gradient(135deg,#c9a84c,#7a6430);border-radius:14px;
          display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:12px}
        .logo h1{font-family:'Playfair Display',serif;font-size:26px;font-weight:900;
          background:linear-gradient(135deg,#f0cc6e,#c9a84c);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        .logo p{font-size:13px;color:rgba(255,255,255,.4);margin-top:4px;font-family:'DM Sans',sans-serif}
        .tabs{display:flex;background:rgba(255,255,255,.05);border-radius:12px;padding:4px;margin-bottom:28px}
        .ttab{flex:1;padding:10px;text-align:center;border-radius:8px;border:none;background:transparent;
          color:rgba(255,255,255,.4);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s}
        .ttab.on{background:rgba(201,168,76,.15);color:#c9a84c;border:1px solid rgba(201,168,76,.2)}
        label{display:block;font-size:12px;font-weight:500;color:rgba(255,255,255,.5);
          font-family:'DM Sans',sans-serif;margin-bottom:8px;margin-top:20px;letter-spacing:.5px}
        input{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);
          border-radius:12px;color:#fff;font-family:'DM Sans',sans-serif;font-size:15px;padding:14px 16px;
          outline:none;transition:border .2s}
        input:focus{border-color:rgba(201,168,76,.5);background:rgba(255,255,255,.07)}
        input::placeholder{color:rgba(255,255,255,.25)}
        .btn{width:100%;background:linear-gradient(135deg,#c9a84c,#a07830);color:#fff;border:none;
          border-radius:12px;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:600;
          padding:15px;cursor:pointer;margin-top:24px;transition:all .2s;letter-spacing:.3px}
        .btn:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(201,168,76,.3)}
        .btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
        .err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);border-radius:10px;
          padding:12px 14px;color:#fca5a5;font-family:'DM Sans',sans-serif;font-size:13px;margin-top:14px}
        .ok{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.2);border-radius:10px;
          padding:12px 14px;color:#86efac;font-family:'DM Sans',sans-serif;font-size:13px;margin-top:14px}
        .divider{text-align:center;margin:24px 0 0;color:rgba(255,255,255,.2);font-size:13px;font-family:'DM Sans',sans-serif}
        .uala-btn{display:block;width:100%;margin-top:12px;padding:14px;text-align:center;
          background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.25);border-radius:12px;
          color:#a5b4fc;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;
          text-decoration:none;transition:all .2s}
        .uala-btn:hover{background:rgba(99,102,241,.2);border-color:rgba(99,102,241,.4)}
        .badge{display:inline-block;background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.3);
          color:#c9a84c;font-size:11px;padding:3px 8px;border-radius:20px;margin-left:6px;vertical-align:middle}
        @media(max-width:480px){.card{padding:28px 20px;border-radius:20px}}
      `}</style>
      <div className="bg">
        <div className="card">
          <div className="logo">
            <div className="logo-icon">🎰</div>
            <h1>Quiniela IA</h1>
            <p>Predicciones basadas en análisis estadístico real</p>
          </div>

          <div className="tabs">
            <button className={`ttab ${tab==="login"?"on":""}`} onClick={()=>{setTab("login");setError("");setSuccess("")}}>Iniciar sesión</button>
            <button className={`ttab ${tab==="register"?"on":""}`} onClick={()=>{setTab("register");setError("");setSuccess("")}}>Crear cuenta</button>
          </div>

          <label>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com" />
          <label>Contraseña</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
            placeholder={tab==="register"?"Mínimo 6 caracteres":"••••••••"}
            onKeyDown={e=>e.key==="Enter"&&handle()} />

          <button className="btn" onClick={handle} disabled={loading}>
            {loading ? "..." : tab==="login" ? "Ingresar →" : "Crear cuenta →"}
          </button>

          {error && <div className="err">⚠ {error}</div>}
          {success && <div className="ok">✓ {success}</div>}

          <div className="divider">
            ¿Querés predicciones 3 y 4 cifras? <span className="badge">PREMIUM</span>
          </div>
          <a href={UALA_LINK} target="_blank" rel="noopener noreferrer" className="uala-btn">
            💳 Suscribite por $1.500/mes via Ualá
          </a>
        </div>
      </div>
    </>
  );
}
