"use client"
import { useState, useEffect } from "react"
interface User{id:string;email:string;role:string;premium_until:string|null;created_at:string}
export default function AdminPage(){
  const [users,setUsers]=useState<User[]>([])
  const [loading,setLoading]=useState(true)
  const [err,setErr]=useState("")
  const [msg,setMsg]=useState("")
  const [token,setToken]=useState("")
  const [search,setSearch]=useState("")
  const [days,setDays]=useState(30)
  const [busy,setBusy]=useState<string|null>(null)
  useEffect(()=>{
    const proj=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").split("//")[1]?.split(".")[0]||"wazkylxgqckjfkcmfotl"
    const raw=localStorage.getItem("sb-"+proj+"-auth-token")
    if(!raw){window.location.href="/login";return}
    try{const s=JSON.parse(raw);if(!s?.access_token){window.location.href="/login";return};setToken(s.access_token);load(s.access_token)}catch{window.location.href="/login"}
  },[])
  async function load(tk:string){
    setLoading(true);setErr("")
    try{
      const r=await fetch("/api/admin",{headers:{Authorization:"Bearer "+tk}})
      const d=await r.json()
      if(!r.ok){if(r.status===401){setErr("No tenes permisos de admin");setLoading(false);return}throw new Error(d.error)}
      setUsers(d.users||[])
    }catch(e:any){setErr(e.message)}finally{setLoading(false)}
  }
  async function act(userId:string,action:string){
    setBusy(userId+action);setMsg("");setErr("")
    try{
      const r=await fetch("/api/admin",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({userId,action,days})})
      const d=await r.json()
      if(!r.ok)throw new Error(d.error)
      setMsg("OK: "+action+" aplicado")
      load(token)
    }catch(e:any){setErr(e.message)}finally{setBusy(null)}
  }
  function dl(until:string|null){
    if(!until)return""
    const d=Math.ceil((new Date(until).getTime()-Date.now())/86400000)
    return d<=0?"VENCIDO":d+" dias"
  }
  const filtered=users.filter(u=>u.email?.toLowerCase().includes(search.toLowerCase()))
  return(<>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@900&family=DM+Sans:wght@400;600&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{background:#06080f;color:#e2e8f0;font-family:'DM Sans',sans-serif;min-height:100vh}.wrap{max-width:900px;margin:0 auto;padding:28px 16px}.nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.07)}.nav-l{display:flex;align-items:center;gap:10px}.ico{width:36px;height:36px;background:linear-gradient(135deg,#c9a84c,#7a6430);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px}.tit{font-family:'Playfair Display',serif;font-size:18px;font-weight:900;background:linear-gradient(135deg,#f0cc6e,#c9a84c);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.bk{padding:7px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:transparent;color:#64748b;font-size:12px;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-block}.bk:hover{border-color:#c9a84c;color:#c9a84c}h1{font-family:'Playfair Display',serif;font-size:22px;color:#e2e8f0;margin-bottom:6px}.sub{font-size:12px;color:#64748b;margin-bottom:20px}.sts{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:24px}.st{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:14px;text-align:center}.stv{font-family:'Playfair Display',serif;font-size:24px;font-weight:700;color:#c9a84c}.stl{font-size:10px;color:#64748b;margin-top:3px}.ctrls{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}input[type=text]{flex:1;min-width:180px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#e2e8f0;font-size:13px;padding:10px 14px;outline:none;font-family:inherit}input[type=text]:focus{border-color:rgba(201,168,76,.4)}input[type=text]::placeholder{color:rgba(255,255,255,.3)}.di{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:6px 12px}.di span{font-size:11px;color:#64748b;white-space:nowrap}.di input{width:50px;background:transparent;border:none;color:#e2e8f0;font-size:13px;outline:none;font-family:inherit;text-align:center}.rl{padding:10px 16px;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.3);border-radius:10px;color:#c9a84c;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}.tb{width:100%;border-collapse:collapse}.tb th{text-align:left;padding:8px 12px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;border-bottom:1px solid rgba(255,255,255,.07)}.tb td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.04);font-size:12px;vertical-align:middle}.tb tr:hover td{background:rgba(255,255,255,.02)}.badge{display:inline-block;padding:3px 8px;border-radius:20px;font-size:10px;font-weight:700}.ba{background:rgba(240,204,110,.15);border:1px solid rgba(240,204,110,.3);color:#f0cc6e}.bp{background:rgba(134,239,172,.15);border:1px solid rgba(134,239,172,.3);color:#86efac}.bf{background:rgba(100,116,139,.15);border:1px solid rgba(100,116,139,.3);color:#94a3b8}.abt{display:flex;gap:6px;flex-wrap:wrap}.bn{padding:5px 10px;border-radius:7px;border:none;font-size:10px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}.bn:disabled{opacity:.5;cursor:not-allowed}.bnp{background:rgba(134,239,172,.15);border:1px solid rgba(134,239,172,.3);color:#86efac}.bna{background:rgba(240,204,110,.15);border:1px solid rgba(240,204,110,.3);color:#f0cc6e}.bnf{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#fca5a5}.ex{font-size:10px}.ew{color:#fbbf24}.eo{color:#86efac}.ms{padding:10px 14px;border-radius:8px;font-size:12px;margin-bottom:12px}.mok{background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);color:#86efac}.mer{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#fca5a5}.empty{text-align:center;padding:40px;color:#64748b;font-size:13px}.sp{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.2);border-top-color:#c9a84c;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    <div className="wrap">
      <div className="nav">
        <div className="nav-l"><div className="ico">⚙️</div><span className="tit">Panel Admin</span></div>
        <a href="/predictions" className="bk">Volver</a>
      </div>
      <h1>Gestion de Usuarios</h1>
      <p className="sub">Activa, desactiva y administra el acceso premium.</p>
      <div className="sts">
        <div className="st"><div className="stv">{users.length}</div><div className="stl">Total usuarios</div></div>
        <div className="st"><div className="stv" style={{color:"#86efac"}}>{users.filter(u=>u.role==="premium"&&u.premium_until&&new Date(u.premium_until)>new Date()).length}</div><div className="stl">Premium activos</div></div>
        <div className="st"><div className="stv" style={{color:"#f0cc6e"}}>{users.filter(u=>u.role==="admin").length}</div><div className="stl">Admins</div></div>
      </div>
      {msg&&<div className="ms mok">OK {msg}</div>}
      {err&&<div className="ms mer">Error: {err}</div>}
      <div className="ctrls">
        <input type="text" placeholder="Buscar por email..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <div className="di"><span>Dias premium:</span><input type="number" value={days} onChange={e=>setDays(Number(e.target.value))} min={1} max={365}/></div>
        <button className="rl" onClick={()=>load(token)}>Actualizar</button>
      </div>
      {loading?<div className="empty"><div className="sp" style={{width:24,height:24}}/></div>:filtered.length===0?<div className="empty">No hay usuarios</div>:(
        <div style={{overflowX:"auto"}}>
          <table className="tb">
            <thead><tr><th>Email</th><th>Rol</th><th>Premium hasta</th><th>Acciones</th></tr></thead>
            <tbody>
              {filtered.map(u=>{
                const d=dl(u.premium_until)
                return(<tr key={u.id}>
                  <td style={{fontFamily:"'DM Mono',monospace",fontSize:11}}>{u.email}</td>
                  <td><span className={`badge ${u.role==="admin"?"ba":u.role==="premium"?"bp":"bf"}`}>{u.role?.toUpperCase()}</span></td>
                  <td>
                    {u.premium_until?<><div style={{fontSize:10,color:"#94a3b8"}}>{new Date(u.premium_until).toLocaleDateString("es-AR")}</div><div className={`ex ${d==="VENCIDO"?"ew":d?"eo":""}`}>{d}</div></>:<span style={{color:"#64748b",fontSize:11}}>—</span>}
                  </td>
                  <td>
                    <div className="abt">
                      <button className="bn bnp" disabled={busy===u.id+"premium"} onClick={()=>act(u.id,"premium")}>{busy===u.id+"premium"?<span className="sp"/>:`+${days}d Premium`}</button>
                      <button className="bn bna" disabled={busy===u.id+"admin"} onClick={()=>act(u.id,"admin")}>{busy===u.id+"admin"?<span className="sp"/>:"Admin"}</button>
                      <button className="bn bnf" disabled={busy===u.id+"free"} onClick={()=>act(u.id,"free")}>{busy===u.id+"free"?<span className="sp"/>:"Free"}</button>
                    </div>
                  </td>
                </tr>)
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </>)
}
