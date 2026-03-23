c = open("app/predictions/page.tsx", encoding="utf-8").read()

# 1. Agregar estado para mis predicciones
c = c.replace(
    "const [dn,setDn]=useState(false)",
    "const [dn,setDn]=useState(false)\n  const [misPreds,setMisPreds]=useState<any[]>([])\n  const [guardando,setGuardando]=useState(false)\n  const [guardadoOk,setGuardadoOk]=useState(false)"
)

# 2. Funcion guardar prediccion y cargar mis predicciones
fn = """
  async function guardarPrediccion(){
    const raw=localStorage.getItem("sb-"+((process.env.NEXT_PUBLIC_SUPABASE_URL||"").split("//")[1]?.split(".")[0]||"wazkylxgqckjfkcmfotl")+"-auth-token")
    if(!raw)return
    const s=JSON.parse(raw)
    setGuardando(true)
    try{
      const hoy=new Date(Date.now()-3*3600000)
      const fechaStr=hoy.toISOString().split("T")[0]
      const nums=cur.slice(0,dg===2?10:5).map((p:any)=>p.numero)
      await fetch("/api/mis-predicciones",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+s.access_token},body:JSON.stringify({date:fechaStr,turno:so,numeros:nums})})
      setGuardadoOk(true)
      setTimeout(()=>setGuardadoOk(false),3000)
      cargarMisPreds(s.access_token)
    }catch{}
    setGuardando(false)
  }
  async function cargarMisPreds(token:string){
    try{
      const r=await fetch("/api/mis-predicciones",{headers:{"Authorization":"Bearer "+token}})
      const d=await r.json()
      if(d.predictions)setMisPreds(d.predictions)
    }catch{}
  }
"""
c = c.replace("  async function gen(){", fn + "  async function gen(){", 1)

# 3. Cargar mis preds al init
c = c.replace(
    "fetch(\"/api/auth/me\",{headers:{Authorization:\"Bearer \"+s.access_token}}).then(r=>r.ok?r.json():null).then(d=>{if(d?.isPremium)setPr(true)}).catch(()=>{})",
    "fetch(\"/api/auth/me\",{headers:{Authorization:\"Bearer \"+s.access_token}}).then(r=>r.ok?r.json():null).then(d=>{if(d?.isPremium)setPr(true)}).catch(()=>{})\n      cargarMisPreds(s.access_token)"
)

# 4. Agregar boton guardar y seccion mis predicciones despues del ibox
old_ibox = '<div className="ib"><strong>Motor:</strong>'
new_ibox = """<div className="ib"><strong>Motor:</strong>"""

# Agregar boton guardar prediccion y seccion mis predicciones antes del share section
old_share = '<div className="shr">'
new_share = """
              <div style={{display:"flex",alignItems:"center",gap:8,margin:"12px 0"}}>
                <button onClick={guardarPrediccion} disabled={guardando||!dn} style={{padding:"8px 16px",background:"rgba(99,102,241,.12)",border:"1px solid rgba(99,102,241,.3)",borderRadius:8,color:"#a5b4fc",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:!dn?.5:1}}>
                  {guardando?"Guardando...":guardadoOk?"Guardado!":"Guardar esta prediccion"}
                </button>
                <span style={{fontSize:10,color:"#64748b"}}>Para comparar con el resultado real</span>
              </div>
              {misPreds.length>0&&<div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.07)",borderRadius:14,padding:"16px",marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:700,color:"#e2e8f0",marginBottom:12}}>Mis predicciones guardadas</div>
                {misPreds.map((p:any,i:number)=>(
                  <div key={i} style={{borderBottom:"1px solid rgba(255,255,255,.05)",paddingBottom:10,marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                      <div style={{fontSize:12,color:"#c9a84c",fontWeight:600}}>{p.turno} - {new Date(p.date).toLocaleDateString("es-AR")}</div>
                      {p.resultado?<div style={{fontSize:11,color:p.acerto?"#86efac":"#64748b",fontWeight:600}}>{p.acerto?`Acertaste ${p.aciertos.length} numero(s)`:"Sin aciertos"}</div>:<div style={{fontSize:10,color:"#64748b"}}>Pendiente resultado</div>}
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:p.aciertos?.length>0?6:0}}>
                      {p.numeros.map((n:string,j:number)=>{
                        const acerto=p.aciertos?.some((a:any)=>a.numero===n)
                        return<span key={j} style={{padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:700,background:acerto?"rgba(134,239,172,.2)":"rgba(255,255,255,.05)",color:acerto?"#86efac":"#94a3b8",border:acerto?"1px solid rgba(134,239,172,.4)":"1px solid rgba(255,255,255,.08)"}}>{n}</span>
                      })}
                    </div>
                    {p.aciertos?.length>0&&<div style={{fontSize:10,color:"#86efac"}}>
                      {p.aciertos.map((a:any)=>`${a.numero} salio en el puesto ${a.puesto}`).join(" | ")}
                    </div>}
                  </div>
                ))}
              </div>}
              <div className="shr">"""

if old_share in c:
    c = c.replace(old_share, new_share, 1)
    print("OK - seccion mis predicciones agregada")
else:
    print("ERROR - no encontrado shr")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
