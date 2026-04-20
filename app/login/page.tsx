"use client"
import { useState } from "react"
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL||""

export default function LoginPage(){
  const [tab,setTab]=useState("up")
  const [email,setEmail]=useState("")
  const [pass,setPass]=useState("")
  const [busy,setBusy]=useState(false)
  const [err,setErr]=useState("")
  const [ok,setOk]=useState("")

  async function submit(){
    if(!email||!pass){setErr("Completa todos los campos");return}
    setBusy(true);setErr("");setOk("")
    try{
      const res=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email.trim(),password:pass,action:tab==="up"?"signup":"signin"})})
      const data=await res.json()
      if(!res.ok){setErr(data.error||"Error");return}
      if(data.needsConfirmation){setOk("Cuenta creada! Ahora inicia sesion.");setTab("in");setPass("");return}
      const proj=SB_URL.split("//")[1]?.split(".")[0]||"project"
      localStorage.setItem("sb-"+proj+"-auth-token",JSON.stringify({access_token:data.access_token,refresh_token:data.refresh_token||"",expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600),token_type:"bearer",user:data.user}))
      setOk("Bienvenido!")
      setTimeout(()=>{window.location.href="/predictions"},400)
    }catch{setErr("Error de conexion")}
    finally{setBusy(false)}
  }

  return(<>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      body{min-height:100vh;background:#06080f;font-family:'Inter',sans-serif;background-image:radial-gradient(ellipse 100% 60% at 50% -5%,rgba(255,45,85,.12),transparent 60%)}
      .page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}
.logo{width:80px;height:80px;background:linear-gradient(180deg,#ff2d55,#cc0033);border-radius:24px;display:inline-flex;align-items:center;justify-content:center;font-size:42px;margin-bottom:14px;box-shadow:0 8px 0 #800020,0 12px 32px rgba(255,45,85,.5)}
        .app-name{font-size:42px;font-weight:900;background:linear-gradient(180deg,#ff90a8,#ff4068,#ff1050);-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:block;margin-bottom:8px;letter-spacing:-1px}
        .tagline{font-size:15px;color:#94a3b8;line-height:1.7;margin-bottom:10px;max-width:340px;text-align:center;font-weight:500}
        .desc{font-size:13px;color:#64748b;line-height:1.7;margin-bottom:24px;max-width:360px;text-align:center}
        .features{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px;max-width:380px;width:100%}
        .feat{background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:10px;box-shadow:0 4px 0 rgba(0,0,0,.3)}
        .feat-ico{font-size:22px;flex-shrink:0}
        .feat-text{font-size:12px;color:#94a3b8;line-height:1.5}
        .feat-text strong{color:#e2e8f0;display:block;font-size:13px;margin-bottom:2px}
        .free-badge{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(180deg,rgba(34,197,94,.15),rgba(34,197,94,.08));border:1px solid rgba(34,197,94,.4);color:#4ade80;font-size:13px;font-weight:800;padding:8px 20px;border-radius:24px;margin-bottom:24px}
        .card{width:100%;max-width:420px;background:linear-gradient(180deg,rgba(20,20,35),rgba(10,10,20));border:1px solid rgba(255,255,255,.1);border-radius:28px;padding:32px 26px;box-shadow:0 40px 100px rgba(0,0,0,.6)}
        .tabs{display:flex;background:rgba(255,255,255,.06);border-radius:14px;padding:4px;margin-bottom:24px;gap:2px}
        .tab{flex:1;padding:14px;text-align:center;border-radius:11px;border:none;background:transparent;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:.2s;color:#475569}
        .tab.on{background:linear-gradient(180deg,#ff2d55,#cc0033);color:#fff;box-shadow:0 4px 0 #800020}
        .tab-free{font-size:10px;color:#86efac;display:block;font-weight:800;margin-top:2px}
        .lbl{display:block;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin:16px 0 6px}
        input{width:100%;background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.1);border-radius:14px;color:#f1f5f9;font-size:16px;padding:16px 16px;outline:none;font-family:inherit;transition:.2s}
        input:focus{border-color:rgba(255,45,85,.6);background:rgba(255,255,255,.1)}
        input::placeholder{color:#475569}
        .btn{width:100%;border:none;border-radius:16px;font-size:16px;font-weight:900;padding:18px;cursor:pointer;margin-top:20px;font-family:inherit;transition:.1s;letter-spacing:.5px;text-transform:uppercase}
        .btn:active{transform:translateY(4px)}
        .btn-in{background:linear-gradient(180deg,#ff2d55,#cc0044);color:#fff;box-shadow:0 6px 0 #800020,0 10px 28px rgba(255,45,85,.5),inset 0 2px 0 rgba(255,255,255,.2)}
        .btn-up{background:linear-gradient(180deg,#22c55e,#15803d);color:#fff;box-shadow:0 6px 0 #064e21,0 10px 28px rgba(34,197,94,.4),inset 0 2px 0 rgba(255,255,255,.2)}
        .btn:disabled{opacity:.5;cursor:not-allowed}
      .err{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:9px;padding:11px 13px;color:#fca5a5;font-size:13px;margin-top:12px}
      .suc{background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:9px;padding:11px 13px;color:#86efac;font-size:13px;margin-top:12px}
      .switch{text-align:center;margin-top:14px;font-size:12px;color:#475569}
      .switch button{background:none;border:none;color:#ff6b81;font-weight:700;cursor:pointer;font-family:inherit;font-size:12px;text-decoration:underline}
      .credit{text-align:center;margin-top:20px;font-size:10px;color:#374151}
      .credit strong{color:#475569}
      @media(max-width:480px){.features{grid-template-columns:1fr}.app-name{font-size:28px}}
    `}</style>
    <div className="page">
      <div style={{textAlign:"center",marginBottom:8}}>
        <div className="logo">🎰</div>
        <span className="app-name">Quiniela IA</span>
        <p className="tagline">Predicciones estadísticas reales para la Quiniela Nacional de Buenos Aires</p>
        <p className="desc">Analizamos el historial real de sorteos y calculamos los números con mayor probabilidad de salir en cada turno del día.</p>
      </div>

      <div className="features">
        <div className="feat"><span className="feat-ico">🧠</span><div className="feat-text"><strong>Motor estadístico</strong>6 factores de análisis real</div></div>
        <div className="feat"><span className="feat-ico">🎰</span><div className="feat-text"><strong>5 sorteos diarios</strong>Previa · Primera · Matutina · Vespertina · Nocturna</div></div>
        <div className="feat"><span className="feat-ico">📡</span><div className="feat-text"><strong>Datos reales</strong>Se actualizan solos tras cada sorteo</div></div>
        <div className="feat"><span className="feat-ico">🤖</span><div className="feat-text"><strong>Inteligencia Artificial</strong>Analiza patrones reales</div></div>
      </div>

      <div className="free-badge">✅ Crear cuenta es 100% GRATIS — sin tarjeta</div>

      <div className="card">
        <div className="tabs">
          <button className={"tab"+(tab==="up"?" on":"")} onClick={()=>{setTab("up");setErr("");setOk("")}}>
            🆕 Crear cuenta
            <span className="tab-free">¡GRATIS!</span>
          </button>
          <button className={"tab"+(tab==="in"?" on":"")} onClick={()=>{setTab("in");setErr("");setOk("")}}>
            👆 Ya tengo cuenta
          </button>
        </div>

        {tab==="up"&&<p style={{fontSize:12,color:"#64748b",marginBottom:8,lineHeight:1.6,textAlign:"center"}}>👇 Completá tus datos y empezá gratis ahora mismo.</p>}
        {tab==="in"&&<p style={{fontSize:12,color:"#64748b",marginBottom:8,lineHeight:1.6,textAlign:"center"}}>👇 Ingresá tu email y contraseña para continuar.</p>}

        <span className="lbl">Email</span>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com" autoComplete="email"/>

        <span className="lbl">{tab==="up"?"Elegí una contraseña":"Contraseña"}</span>
        <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder={tab==="up"?"Mínimo 6 caracteres":"Tu contraseña"} onKeyDown={e=>e.key==="Enter"&&!busy&&submit()}/>

        <button className={"btn "+(tab==="in"?"btn-in":"btn-up")} onClick={submit} disabled={busy}>
          {busy?"⏳ Verificando...":tab==="in"?"👆 Ingresar →":"🚀 Crear cuenta gratis →"}
        </button>

        {err&&<div className="err">✗ {err}</div>}
        {ok&&<div className="suc">✓ {ok}</div>}

        <div className="switch">
          {tab==="up"?<>👆 ¿Ya tenés cuenta? <button onClick={()=>{setTab("in");setErr("");setOk("")}}>Tocá acá para ingresar</button></>:<>🆕 ¿No tenés cuenta? <button onClick={()=>{setTab("up");setErr("");setOk("")}}>Creala gratis acá</button></>}
        </div>
      </div>

      <div className="credit">Desarrollado por <strong>EstudioWebPin</strong> · <strong>Adrian Hugo Lopez</strong></div>
    </div>
  </>)
}
