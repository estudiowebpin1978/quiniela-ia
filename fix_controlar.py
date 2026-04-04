c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Agregar estado para control de jugada
c = c.replace(
    "const [guardadoOk,setGuardadoOk]=useState(false)",
    "const [guardadoOk,setGuardadoOk]=useState(false)\n  const [controlando,setControlando]=useState(false)\n  const [resultadoControl,setResultadoControl]=useState<any>(null)"
)

# Agregar funcion controlar jugada
fn_controlar = """
  async function controlarJugada(){
    if(!dt?.numeros?.length){alert("Primero genera una prediccion");return}
    setControlando(true);setResultadoControl(null)
    try{
      const hoy=new Date(Date.now()-3*3600000).toISOString().split("T")[0]
      const r=await fetch(`/api/predictions?sorteo=${encodeURIComponent(so)}`,{headers:{Authorization:"Bearer "+tkRef.current}})
      const d=await r.json()
      // Buscar resultado real en la DB
      const r2=await fetch(`${(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/"/g,"")}/rest/v1/draws?date=eq.${hoy}&turno=eq.${encodeURIComponent(so)}&select=numbers&limit=1`,{
        headers:{"apikey":process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"","Authorization":"Bearer "+(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"")}
      })
      const draws=await r2.json()
      const draw=draws?.[0]
      if(!draw?.numbers?.length){
        setResultadoControl({error:"Todavia no hay resultado para este sorteo. Intentá después del sorteo."})
        return
      }
      const reales=draw.numbers.map((n:any)=>String(Number(n)%100).padStart(2,"0"))
      const predichos=cur.slice(0,dg===2?10:5).map((p:any)=>p.numero)
      const aciertos=predichos.filter((n:string)=>reales.includes(n)).map((n:string)=>({numero:n,puesto:reales.indexOf(n)+1}))
      setResultadoControl({aciertos,predichos,reales,fecha:hoy,turno:so})
    }catch(e:any){setResultadoControl({error:"Error: "+e.message})}
    setControlando(false)
  }
"""
c = c.replace("  async function guardarPrediccion(){", fn_controlar + "  async function guardarPrediccion(){", 1)

# Agregar boton controlar jugada debajo del boton generar
old_btn = '<button className="btn3d btn-gen" onClick={gen} disabled={ld} style={{opacity:ld?.6:1}}>{ld?"⏳ Analizando datos...":"⚡ Generar Predicción Ahora"}</button>'
new_btn = """<button className="btn3d btn-gen" onClick={gen} disabled={ld} style={{opacity:ld?.6:1}}>{ld?"⏳ Analizando datos...":"⚡ Generar Predicción Ahora"}</button>
        {dn&&<button onClick={controlarJugada} disabled={controlando} style={{width:"100%",padding:"13px",borderRadius:13,border:"1.5px solid rgba(32,213,236,.3)",background:"rgba(32,213,236,.08)",color:"#20d5ec",fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"'Inter',sans-serif",marginBottom:8,boxShadow:"0 4px 0 rgba(0,168,200,.3)",transition:".1s"}}>
          {controlando?"⏳ Verificando...":"🎯 Controlar Jugada"}
        </button>}
        {resultadoControl&&<div style={{background:resultadoControl.error?"rgba(239,68,68,.07)":resultadoControl.aciertos?.length>0?"rgba(34,197,94,.08)":"rgba(255,255,255,.03)",border:"1.5px solid "+(resultadoControl.error?"rgba(239,68,68,.2)":resultadoControl.aciertos?.length>0?"rgba(34,197,94,.3)":"rgba(255,255,255,.08)"),borderRadius:14,padding:"16px",marginBottom:12}}>
          {resultadoControl.error?<div style={{fontSize:13,color:"#fca5a5",textAlign:"center"}}>{resultadoControl.error}</div>:<>
            <div style={{fontSize:12,fontWeight:800,color:resultadoControl.aciertos?.length>0?"#86efac":"#94a3b8",marginBottom:10,textAlign:"center"}}>
              {resultadoControl.aciertos?.length>0?"🎉 Acertaste "+resultadoControl.aciertos.length+" numero(s)!":"😔 Sin aciertos esta vez"}
            </div>
            {resultadoControl.aciertos?.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginBottom:10}}>
              {resultadoControl.aciertos.map((a:any,i:number)=>(
                <div key={i} style={{background:"rgba(34,197,94,.15)",border:"1px solid rgba(34,197,94,.4)",borderRadius:10,padding:"6px 12px",textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:900,color:"#86efac"}}>{a.numero}</div>
                  <div style={{fontSize:9,color:"#4ade80"}}>Puesto {a.puesto}</div>
                </div>
              ))}
            </div>}
            <div style={{fontSize:10,color:"#475569",textAlign:"center"}}>
              Sorteo: {resultadoControl.turno} del {resultadoControl.fecha}
            </div>
          </>}
        </div>}"""

if old_btn in c:
    c = c.replace(old_btn, new_btn, 1)
    print("OK - boton controlar jugada agregado")
else:
    print("ERROR - buscando boton gen...")
    idx = c.find("Generar Predicción Ahora")
    print(repr(c[idx-50:idx+80]))

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
