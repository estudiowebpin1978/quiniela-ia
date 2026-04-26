"use client"
import { useState } from "react"
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL||""

export default function LoginPage(){
  const [tab,setTab]=useState("in")
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
      body{min-height:100vh;background:#050510;font-family:'Inter',sans-serif}
      .page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;background:radial-gradient(ellipse 100% 80% at 50% -20%,rgba(120,0,255,0.15),transparent 50%),radial-gradient(ellipse 80% 60% at 80% 100%,rgba(255,0,100,0.1),transparent 50%),#050510}
.logo{width:80px;height:80px;background:linear-gradient(135deg,#ff3366,#ff1a53,#cc0033);border-radius:24px;display:inline-flex;align-items:center;justify-content:center;font-size:42px;margin-bottom:14px;box-shadow:0 8px 0 #990033,0 12px 32px rgba(255,51,102,0.4),inset 0 2px 0 rgba(255,255,255,0.2);transform:translateY(-4px)}
        .logo:hover{transform:translateY(-6px);box-shadow:0 10px 0 #990033,0 16px 40px rgba(255,51,102,0.5),inset 0 2px 0 rgba(255,255,255,0.2)}
        .app-name{font-size:38px;font-weight:900;background:linear-gradient(135deg,#ff6699,#ff3366,#cc0033);-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:block;letter-spacing:-1px;text-shadow:0 4px 20px rgba(255,51,102,0.4)}
        .card{width:100%;max-width:360px;background:linear-gradient(180deg,rgba(20,20,40,0.95),rgba(10,10,25,0.98));border:1px solid rgba(255,255,255,.08);border-radius:28px;padding:28px 24px;box-shadow:0 25px 80px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,.05)}
        .tabs{display:flex;background:rgba(0,0,0,0.3);border-radius:14px;padding:5px;margin-bottom:24px;gap:4px}
        .tab{flex:1;padding:14px 10px;text-align:center;border-radius:10px;border:none;background:transparent;font-size:13px;font-weight:700;cursor:pointer;color:#64748b;transition:all .2s}
        .tab.on{background:linear-gradient(135deg,#ff3366,#cc0033);color:#fff;box-shadow:0 4px 12px rgba(255,51,102,0.4)}
        .lbl{display:block;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px}
        input{width:100%;background:rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,.08);border-radius:12px;color:#fff;font-size:15px;padding:14px 16px;outline:none;transition:all .2s;font-family:inherit}
        input:focus{border-color:#ff3366;background:rgba(255,51,102,0.08);box-shadow:0 0 20px rgba(255,51,102,0.15)}
        input::placeholder{color:#475569}
        .btn{width:100%;border:none;border-radius:14px;font-size:16px;font-weight:900;padding:16px;cursor:pointer;margin-top:20px;background:linear-gradient(135deg,#ff3366,#cc0033);color:#fff;box-shadow:0 6px 0 #990033,0 8px 24px rgba(255,51,102,0.4),inset 0 2px 0 rgba(255,255,255,0.2);transition:all .15s}
        .btn:active{transform:translateY(3px);box-shadow:0 3px 0 #990033,0 4px 12px rgba(255,51,102,0.3)}
        .btn-up{background:linear-gradient(135deg,#22c55e,#16a34a);box-shadow:0 6px 0 #166534,0 8px 24px rgba(34,197,94,0.3),inset 0 2px 0 rgba(255,255,255,0.2)}
        .btn:disabled{opacity:.5;cursor:not-allowed}
      .err{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:12px 14px;color:#fca5a5;font-size:13px;margin-top:14px}
      .suc{background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);border-radius:10px;padding:12px 14px;color:#86efac;font-size:13px;margin-top:14px}
      .badge{background:linear-gradient(135deg,rgba(34,197,94,0.2),rgba(34,197,94,0.1));border:1px solid rgba(34,197,94,0.3);color:#4ade80;font-size:12px;font-weight:700;padding:10px 16px;border-radius:20px;margin-bottom:20px;display:inline-flex;align-items:center;gap:6px}
    `}</style>
    <div className="page">
      <div style={{textAlign:"center",marginBottom:24}}>
        <div className="logo">🎰</div>
        <span className="app-name">Quiniela IA</span>
        <div style={{fontSize:13,color:"#64748b",marginTop:8,letterSpacing:1}}>PREDICCIONES ESTADÍSTICAS</div>
      </div>

      <div className="badge">🎉 100% GRÁTIS · SIN TARJETA</div>

      <div className="card">
        <div className="tabs">
          <button className={"tab"+(tab==="in"?" on":"")} onClick={()=>{setTab("in");setErr("");setOk("")}}>🔐 Entrar</button>
          <button className={"tab"+(tab==="up"?" on":"")} onClick={()=>{setTab("up");setErr("");setOk("")}}>✨ Crear cuenta</button>
        </div>

        <span className="lbl">Email</span>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com" autoComplete="email"/>

        <span className="lbl">Contraseña</span>
        <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&!busy&&submit()}/>

        <button className={"btn "+(tab==="up"?"btn-up":"")} onClick={submit} disabled={busy}>
          {busy?"⏳ Procesando...":tab==="in"?"🚀 Entrar al sistema":"🎯 Crear mi cuenta"}
        </button>

        {err&&<div className="err">⚠️ {err}</div>}
        {ok&&<div className="suc">✅ {ok}</div>}
      </div>

      <div style={{marginTop:24,fontSize:11,color:"#475569",textAlign:"center"}}>
        Al continuar aceptas nuestros términos
      </div>
    </div>
  </>)
}
