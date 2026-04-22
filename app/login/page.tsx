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
      body{min-height:100vh;background:#06080f;font-family:'Inter',sans-serif}
      .page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}
.logo{width:60px;height:60px;background:linear-gradient(180deg,#ff2d55,#cc0033);border-radius:18px;display:inline-flex;align-items:center;justify-content:center;font-size:32px;margin-bottom:12px}
        .app-name{font-size:32px;font-weight:900;background:linear-gradient(180deg,#ff90a8,#ff4068);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        .card{width:100%;max-width:340px;background:linear-gradient(180deg,rgba(20,20,35),rgba(10,10,20));border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:24px 20px}
        .tabs{display:flex;background:rgba(255,255,255,.06);border-radius:12px;padding:4px;margin-bottom:20px}
        .tab{flex:1;padding:12px;text-align:center;border-radius:9px;border:none;background:transparent;font-size:14px;font-weight:700;cursor:pointer;color:#475569}
        .tab.on{background:#ff2d55;color:#fff}
        .lbl{display:block;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin:12px 0 4px}
        input{width:100%;background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.1);border-radius:10px;color:#f1f5f9;font-size:15px;padding:14px 14px;outline:none}
        input:focus{border-color:#ff2d55}
        .btn{width:100%;border:none;border-radius:12px;font-size:15px;font-weight:800;padding:14px;cursor:pointer;margin-top:16px;background:#ff2d55;color:#fff}
        .btn-up{background:#22c55e}
        .btn:disabled{opacity:.5}
      .err{background:rgba(239,68,68,.1);border-radius:8px;padding:10px;color:#fca5a5;font-size:12px;margin-top:10px}
      .suc{background:rgba(34,197,94,.1);border-radius:8px;padding:10px;color:#86efac;font-size:12px;margin-top:10px}
    `}</style>
    <div className="page">
      <div style={{textAlign:"center",marginBottom:20}}>
        <div className="logo">🎰</div>
        <span className="app-name">Quiniela IA</span>
      </div>

      <div className="card">
        <div className="tabs">
          <button className={"tab"+(tab==="in"?" on":"")} onClick={()=>{setTab("in");setErr("");setOk("")}}>Iniciar sesión</button>
          <button className={"tab"+(tab==="up"?" on":"")} onClick={()=>{setTab("up");setErr("");setOk("")}}>Crear cuenta</button>
        </div>

        <span className="lbl">Email</span>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com"/>

        <span className="lbl">Contraseña</span>
        <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••" onKeyDown={e=>e.key==="Enter"&&!busy&&submit()}/>

        <button className={"btn "+(tab==="up"?"btn-up":"")} onClick={submit} disabled={busy}>
          {busy?"...":tab==="in"?"Entrar":"Crear cuenta"}
        </button>

        {err&&<div className="err">{err}</div>}
        {ok&&<div className="suc">{ok}</div>}
      </div>
    </div>
  </>)
}
