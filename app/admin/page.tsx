"use client"
import { useState, useEffect } from "react"
interface User{id:string;email:string;role:string;premium_until:string|null}
export default function AdminPage(){
  const [users,setUsers]=useState<User[]>([])
  const [loading,setLoading]=useState(true)
  const [err,setErr]=useState("")
  const [msg,setMsg]=useState("")
  const [token,setToken]=useState("")
  const [search,setSearch]=useState("")
  const [days,setDays]=useState(30)
  const [busy,setBusy]=useState<string|null>(null)
  const [ne,setNe]=useState("")
  const [np,setNp]=useState("")
  const [nr,setNr]=useState("premium")
  const [creating,setCreating]=useState(false)
  const [scraperDate,setScraperDate]=useState(new Date().toISOString().split("T")[0])
  const [backtestDays,setBacktestDays]=useState(30)
  const [backtestTurno,setBacktestTurno]=useState("Nocturna")
  const [backtestResult,setBacktestResult]=useState<any>(null)
  useEffect(()=>{
    const proj=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").split("//")[1]?.split(".")[0]||"wazkylxgqckjfkcmfotl"
    const raw=localStorage.getItem("sb-"+proj+"-auth-token")
    if(!raw){window.location.href="/login";return}
    try{const s=JSON.parse(raw);if(!s?.access_token){window.location.href="/login";return};setToken(s.access_token);load(s.access_token)}catch{window.location.href="/login"}
  },[])

  async function runScraper(turno:string){
    setBusy(turno);setMsg("")
    try{
      const params = new URLSearchParams({secret:"quiniela2024cron", turno})
      if(scraperDate) params.set("date", scraperDate)
      const r=await fetch(`/api/cron?${params}`,{headers:{Authorization:"Bearer "+token}})
      const d=await r.json()
      if(d.ok){setMsg("OK - "+JSON.stringify(d.results||d))}
      else{setMsg("Error: "+JSON.stringify(d))}
    }catch(e:any){setMsg("Error: "+e.message)}
    setBusy(null)
  }
  async function runBacktest(){
    setBusy("backtest");setBacktestResult(null)
    try{
      const params = new URLSearchParams({days:backtestDays.toString(), turno:backtestTurno})
      const r=await fetch(`/api/backtest?${params}`,{headers:{Authorization:"Bearer "+token}})
      const d=await r.json()
      if(d.error){setBacktestResult({error:d.error})}
      else{setBacktestResult(d)}
    }catch(e:any){setBacktestResult({error:"Error: "+e.message})}
    setBusy(null)
  }
  async function load(tk:string){
    setLoading(true);setErr("")
    try{const r=await fetch("/api/admin",{headers:{Authorization:"Bearer "+tk}});const d=await r.json();if(!r.ok){setErr(r.status===401?"No tenes permisos de admin":d.error);setLoading(false);return};setUsers(d.users||[])}catch(e:any){setErr(e.message)}finally{setLoading(false)}
  }
  async function upd(userId:string,action:string){
    setBusy(userId+action);setMsg("");setErr("")
    try{const r=await fetch("/api/admin",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({userId,action,days})});const d=await r.json();if(!r.ok)throw new Error(d.error);const lb:any={premium:`Premium por ${days} dias activado`,admin:"Admin permanente activado",free:"Acceso premium removido"};setMsg(lb[action]);load(token)}catch(e:any){setErr(e.message)}finally{setBusy(null)}
  }
  async function create(){
    if(!ne||!np){setErr("Completa email y contrasena");return}
    setCreating(true);setMsg("");setErr("")
    try{const r=await fetch("/api/admin",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({action:"create",email:ne,password:np,role:nr,days})});const d=await r.json();if(!r.ok)throw new Error(d.error);setMsg("Usuario "+ne+" creado con rol "+nr);setNe("");setNp("");load(token)}catch(e:any){setErr(e.message)}finally{setCreating(false)}
  }
  function dl(until:string|null){if(!until)return null;const d=Math.ceil((new Date(until).getTime()-Date.now())/86400000);return d<=0?{t:"VENCIDO",ok:false}:{t:d+" dias restantes",ok:true}}
  const filtered=users.filter(u=>u.email?.toLowerCase().includes(search.toLowerCase()))
  const prem=users.filter(u=>u.role==="premium"&&u.premium_until&&new Date(u.premium_until)>new Date()).length
  let content: React.ReactNode
  if (loading) content = <div className="empty">Loading...</div>
  else if (filtered.length===0) content = <div className="empty">{"No hay usuarios" + (search ? " con ese email" : "")}</div>
  else content = (
    <div style={{overflowX:"auto"}}>
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{background:"rgba(255,45,85,.08)",border:"1px solid rgba(255,45,85,.2)",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#ff6b81",fontWeight:700}}>
          Total: {users.length} usuarios
        </div>
        <div style={{background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.2)",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#86efac",fontWeight:700}}>
          Premium: {prem} usuarios
        </div>
        <div style={{background:"rgba(201,168,76,.08)",border:"1px solid rgba(201,168,76,.2)",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#c9a84c",fontWeight:700}}>
          Admin: {users.filter(u=>u.role==="admin").length}
        </div>
        <div style={{background:"rgba(100,116,139,.08)",border:"1px solid rgba(100,116,139,.2)",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#94a3b8",fontWeight:700}}>
          Free: {users.filter(u=>u.role==="free"||!u.role).length}
        </div>
      </div>
      <table className="tb">
        <thead><tr><th>Email</th><th>Rol actual</th><th>Premium hasta</th><th>Acciones</th></tr></thead>
        <tbody>{filtered.map(u=>{const d=dl(u.premium_until);return <tr key={u.id}>
          <td><div className="em">{u.email}</div></td>
          <td><span className={`rp ${u.role==="admin"?"ra":u.role==="premium"?"rpr":"rf"}`}>{u.role==="admin"?"★ ADMIN":u.role==="premium"?"✓ PREMIUM":"FREE"}</span></td>
          <td>{u.premium_until?<><div className="ed">{new Date(u.premium_until).toLocaleDateString("es-AR")}</div>{d&&<div className={d.ok?"eo":"ew"}>{d.t}</div>}</>:<span style={{color:"#64748b",fontSize:11}}>Sin premium</span>}</td>
          <td><div className="ar">
            <button className="ab ap" disabled={busy===u.id+"premium"} onClick={()=>upd(u.id,"premium")}>{busy===u.id+"premium"?<span className="sp"/>:`+${days}d Premium`}</button>
            <button className="ab aa" disabled={busy===u.id+"admin"} onClick={()=>upd(u.id,"admin")}>{busy===u.id+"admin"?<span className="sp"/>:"Hacer Admin"}</button>
            <button className="ab af" disabled={busy===u.id+"free"} onClick={()=>upd(u.id,"free")}>{busy===u.id+"free"?<span className="sp"/>:"Quitar acceso"}</button>
          </div></td>
        </tr>})}</tbody>
      </table>
    </div>
  )

  return (
    <div className="pg">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600&family=DM+Mono&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{background:#06080f;color:#e2e8f0;font-family:'DM Sans',sans-serif;min-height:100vh}.pg{max-width:960px;margin:0 auto;padding:24px 16px 60px}.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.07)}.brand{display:flex;align-items:center;gap:10px}.bico{width:38px;height:38px;background:linear-gradient(135deg,#c9a84c,#7a6430);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px}.bnm{font-family:'Playfair Display',serif;font-size:19px;font-weight:900;background:linear-gradient(135deg,#f0cc6e,#c9a84c);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.bk{padding:7px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:transparent;color:#64748b;font-size:12px;text-decoration:none;display:inline-block}.bk:hover{border-color:#c9a84c;color:#c9a84c}h1{font-family:'Playfair Display',serif;font-size:24px;font-weight:900;color:#e2e8f0;margin-bottom:4px}.sub{font-size:12px;color:#64748b;margin-bottom:24px}.sg{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}.sc{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:16px 12px;text-align:center}.sv{font-family:'Playfair Display',serif;font-size:28px;font-weight:900;color:#c9a84c}.sv.g{color:#86efac}.sv.au{color:#f0cc6e}.sv.b{color:#60a5fa}.sl{font-size:11px;color:#64748b;margin-top:3px}.sec{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:20px;margin-bottom:20px}.st{font-family:'Playfair Display',serif;font-size:16px;color:#e2e8f0;margin-bottom:16px;display:flex;align-items:center;gap:8px}.st::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.07)}.fr{display:flex;gap:10px;flex-wrap:wrap}.fg{flex:1;min-width:160px}.fl{display:block;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}.fi{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#e2e8f0;font-size:13px;padding:10px 14px;outline:none;font-family:inherit}.fi:focus{border-color:rgba(201,168,76,.5)}.fi::placeholder{color:rgba(255,255,255,.25)}.fs{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#e2e8f0;font-size:13px;padding:10px 14px;outline:none;cursor:pointer;font-family:inherit}.bc{padding:10px 20px;background:linear-gradient(135deg,#c9a84c,#7a6430);color:#000;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;align-self:flex-end;margin-top:24px}.bc:disabled{opacity:.5;cursor:not-allowed}.sr{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}.si{flex:1;min-width:180px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#e2e8f0;font-size:13px;padding:10px 14px;outline:none;font-family:inherit}.si::placeholder{color:rgba(255,255,255,.3)}.db{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 14px}.db span{font-size:11px;color:#64748b;white-space:nowrap}.db input{width:52px;background:transparent;border:none;color:#e2e8f0;font-size:13px;outline:none;font-family:inherit;text-align:center}.rb{padding:10px 16px;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.3);border-radius:10px;color:#c9a84c;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}.tb{width:100%;border-collapse:collapse}.tb th{text-align:left;padding:10px 14px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;border-bottom:1px solid rgba(255,255,255,.08)}.tb td{padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle}.tb tr:hover td{background:rgba(255,255,255,.02)}.em{font-family:'DM Mono',monospace;font-size:11px}.rp{display:inline-flex;align-items:center;padding:4px 10px;border-radius:20px;font-size:10px;font-weight:700}.ra{background:rgba(240,204,110,.15);border:1px solid rgba(240,204,110,.3);color:#f0cc6e}.rpr{background:rgba(134,239,172,.15);border:1px solid rgba(134,239,172,.3);color:#86efac}.rf{background:rgba(100,116,139,.12);border:1px solid rgba(100,116,139,.25);color:#94a3b8}.eo{font-size:10px;color:#86efac;margin-top:2px}.ew{font-size:10px;color:#fbbf24;margin-top:2px}.ed{font-size:10px;color:#64748b}.ar{display:flex;gap:6px;flex-wrap:wrap}.ab{padding:6px 12px;border-radius:8px;border:none;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}.ab:disabled{opacity:.4;cursor:not-allowed}.ap{background:rgba(134,239,172,.12);border:1px solid rgba(134,239,172,.25);color:#86efac}.aa{background:rgba(240,204,110,.12);border:1px solid rgba(240,204,110,.25);color:#f0cc6e}.af{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#fca5a5}.mok{background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);color:#86efac;border-radius:10px;padding:11px 14px;font-size:12px;margin-bottom:14px}.mer{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#fca5a5;border-radius:10px;padding:11px 14px;font-size:12px;margin-bottom:14px}.empty{text-align:center;padding:40px;color:#64748b;font-size:13px}.sp{display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.2);border-top-color:currentColor;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:600px){.sg{grid-template-columns:repeat(2,1fr)}.ar{flex-direction:column}}`}</style>
      <div className="top">
        <div className="brand"><div className="bico">⚙️</div><span className="bnm">Panel Admin</span></div>
        <a href="/predictions" className="bk">← Volver a la app</a>
      </div>
      <h1>Gestion de Usuarios</h1>
      <p className="sub">Administra el acceso premium. Activa suscripciones, cambia roles y crea usuarios nuevos.</p>
      <div className="sg">
        <div className="sc"><div className="sv">{users.length}</div><div className="sl">Total usuarios</div></div>
        <div className="sc"><div className="sv g">{prem}</div><div className="sl">Premium activos</div></div>
        <div className="sc"><div className="sv au">{users.filter(u=>u.role==="admin").length}</div><div className="sl">Admins</div></div>
        <div className="sc"><div className="sv b">{users.filter(u=>u.role==="free").length}</div><div className="sl">Plan free</div></div>
      </div>
      {msg&&<div className="mok">✓ {msg}</div>}
      {err&&<div className="mer">✗ {err}</div>}
      <div className="sec">
        <div className="st">Crear usuario nuevo</div>
        <div className="fr">
          <div className="fg"><label className="fl">Email</label><input className="fi" type="email" placeholder="usuario@email.com" value={ne} onChange={e=>setNe(e.target.value)}/></div>
          <div className="fg"><label className="fl">Contrasena</label><input className="fi" type="text" placeholder="Minimo 6 caracteres" value={np} onChange={e=>setNp(e.target.value)}/></div>
          <div className="fg" style={{minWidth:120,maxWidth:150}}><label className="fl">Rol</label><select className="fs" value={nr} onChange={e=>setNr(e.target.value)}><option value="free">Free</option><option value="premium">Premium</option><option value="admin">Admin</option></select></div>
          <button className="bc" onClick={create} disabled={creating}>{creating?<span className="sp"/>:"Crear usuario"}</button>
        </div>
      </div>
      <div className="sec">
        <div className="st">Usuarios registrados</div>
        <div className="sr">
          <input className="si" type="text" placeholder="Buscar por email..." value={search} onChange={e=>setSearch(e.target.value)}/>
          <div className="db"><span>Dias premium:</span><input type="number" value={days} onChange={e=>setDays(Number(e.target.value))} min={1} max={365}/></div>
          <button className="rb" onClick={()=>load(token)}>↻ Actualizar</button>
        </div>
        {content}
      </div>
    </div>
  )
}

