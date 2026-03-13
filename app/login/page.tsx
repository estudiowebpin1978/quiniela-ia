"use client";
import { useState } from "react";

const UALA = "https://pagar.ualabis.com.ar/order/df50920d5961bd85d19f4231747cc5d7e6ca0489da6e76a4";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export default function LoginPage() {
  const [tab, setTab] = useState<"in"|"up">("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const go = async () => {
    if (!email.trim() || !pass.trim()) { setErr("Completa todos los campos."); return; }
    if (tab === "up" && pass.length < 6) { setErr("Minimo 6 caracteres."); return; }
    setBusy(true); setErr(""); setOk("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: pass, action: tab === "up" ? "signup" : "signin" }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Error desconocido."); return; }
      if (data.needsConfirmation) { setOk("Revisa tu email para confirmar y luego inicia sesion."); setTab("in"); return; }
      const proj = SB_URL.split("//")[1]?.split(".")[0] ?? "project";
      localStorage.setItem("sb-"+proj+"-auth-token", JSON.stringify({ access_token: data.access_token, refresh_token: data.refresh_token ?? "", expires_at: Math.floor(Date.now()/1000)+(data.expires_in??3600), token_type: "bearer", user: data.user }));
      setOk(tab==="in" ? "Bienvenido! Ingresando..." : "Cuenta creada! Ingresando...");
      setTimeout(() => { window.location.href = "/predictions"; }, 500);
    } catch { setErr("Error de conexion. Verifica tu internet."); }
    finally { setBusy(false); }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@900&family=DM+Sans:wght@400;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{min-height:100vh;background:#06080f;display:flex;align-items:center;justify-content:center;padding:20px;font-family:'DM Sans',sans-serif;background-image:radial-gradient(ellipse 80% 60% at 50% -10%,rgba(99,102,241,.18),transparent 65%)}
        .card{width:100%;max-width:400px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.09);border-radius:22px;padding:34px 28px;box-shadow:0 30px 70px rgba(0,0,0,.6)}
        .top{text-align:center;margin-bottom:26px}
        .ico{width:52px;height:52px;background:linear-gradient(135deg,#c9a84c,#7a6430);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:10px}
        h1{font-family:'Playfair Display',serif;font-size:26px;font-weight:900;background:linear-gradient(135deg,#f0cc6e,#c9a84c);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        .sub{font-size:12px;color:rgba(255,255,255,.3);margin-top:4px}
        .tabs{display:flex;background:rgba(255,255,255,.05);border-radius:11px;padding:3px;margin-bottom:22px;gap:2px}
        .tab{flex:1;padding:9px;text-align:center;border-radius:8px;border:none;background:transparent;color:rgba(255,255,255,.35);font-size:13px;font-weight:500;cursor:pointer;transition:.2s;font-family:inherit}
        .tab.on{background:rgba(201,168,76,.14);color:#c9a84c;border:1px solid rgba(201,168,76,.25)}
        .lbl{display:block;font-size:11px;font-weight:600;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.5px;margin:16px 0 5px}
        input{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-size:15px;padding:12px 14px;outline:none;transition:.2s;font-family:inherit}
        input:focus{border-color:rgba(201,168,76,.5)}
        input::placeholder{color:rgba(255,255,255,.2)}
        .btn{width:100%;background:linear-gradient(135deg,#c9a84c,#9a6f28);color:#fff;border:none;border-radius:11px;font-size:15px;font-weight:700;padding:14px;cursor:pointer;margin-top:20px;transition:.2s;font-family:inherit}
        .btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 24px rgba(201,168,76,.35)}
        .btn:disabled{opacity:.5;cursor:not-allowed}
        .err{background:rgba(239,68,68,.09);border:1px solid rgba(239,68,68,.2);border-radius:9px;padding:11px 13px;color:#fca5a5;font-size:13px;margin-top:12px;line-height:1.6}
        .suc{background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:9px;padding:11px 13px;color:#86efac;font-size:13px;margin-top:12px}
        .sep{text-align:center;margin:18px 0 0;color:rgba(255,255,255,.18);font-size:11px}
        .uala{display:block;width:100%;margin-top:9px;padding:12px;text-align:center;background:rgba(99,102,241,.09);border:1px solid rgba(99,102,241,.22);border-radius:10px;color:#a5b4fc;font-size:12px;font-weight:500;text-decoration:none}
        .pill{display:inline-block;background:rgba(201,168,76,.14);border:1px solid rgba(201,168,76,.28);color:#c9a84c;font-size:10px;padding:2px 7px;border-radius:20px;margin-left:4px}
      `}</style>
      <div className="card">
        <div className="top">
          <div className="ico">🎰</div>
          <h1>Quiniela IA</h1>
          <div className="sub">Predicciones estadisticas reales</div>
        </div>
        <div className="tabs">
          <button className={`tab ${tab==="in"?"on":""}`} onClick={()=>{setTab("in");setErr("");setOk("")}}>Iniciar sesion</button>
          <button className={`tab ${tab==="up"?"on":""}`} onClick={()=>{setTab("up");setErr("");setOk("")}}>Crear cuenta</button>
        </div>
        <span className="lbl">Email</span>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com" autoComplete="email"/>
        <span className="lbl">Contrasena</span>
        <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder={tab==="up"?"Minimo 6 caracteres":"..."} onKeyDown={e=>e.key==="Enter"&&!busy&&go()}/>
        <button className="btn" onClick={go} disabled={busy}>{busy?"Verificando...":tab==="in"?"Ingresar":"Crear cuenta"}</button>
        {err&&<div className="err">X {err}</div>}
        {ok&&<div className="suc">OK {ok}</div>}
        <div className="sep">Predicciones 3 y 4 cifras + Redoblona<span className="pill">PREMIUM</span></div>
        <a href={UALA} target="_blank" rel="noopener noreferrer" className="uala">Suscribirme por $10.000/mes via Uala</a>
      </div>
    </>
  );
}
