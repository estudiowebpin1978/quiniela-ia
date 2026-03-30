c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Agregar estado para ultimo resultado
c = c.replace(
    "const [stats,setStats]=useState<any>(null)",
    "const [stats,setStats]=useState<any>(null)\n  const [ultimoRes,setUltimoRes]=useState<any>(null)"
)

# Cargar ultimo resultado al inicio
c = c.replace(
    "fetch(\"/api/estadisticas\").then(r=>r.json()).then(d=>setStats(d)).catch(()=>{})",
    """fetch("/api/estadisticas").then(r=>r.json()).then(d=>setStats(d)).catch(()=>{})
      fetch("/api/predictions?sorteo="+so).then(r=>r.json()).then(d=>{
        if(d?.numeros?.length>0)setUltimoRes(d)
      }).catch(()=>{})"""
)

# Agregar seccion de ultimo resultado despues de las stats
old_hero_end = '{stats?.mensaje&&<div style={{fontSize:11,color:"#20d5ec"'
new_section = """{ultimoRes?.numeros?.length>0&&<div style={{background:"rgba(255,45,85,.04)",border:"1px solid rgba(255,45,85,.15)",borderRadius:12,padding:"10px 14px",marginTop:10,textAlign:"center"}}>
            <div style={{fontSize:10,color:"#ff6b81",fontWeight:700,marginBottom:6}}>Ultimo analisis — {ultimoRes.sorteo}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center"}}>
              {ultimoRes.numeros.slice(0,5).map((n:any,i:number)=>(
                <span key={i} style={{background:"rgba(255,45,85,.15)",color:"#ff6b81",padding:"3px 8px",borderRadius:6,fontSize:12,fontWeight:800}}>{n.numero}</span>
              ))}
            </div>
            <div style={{fontSize:9,color:"#475569",marginTop:5}}>Toca Generar Prediccion para analisis completo</div>
          </div>}
          """
new_section += '{stats?.mensaje&&<div style={{fontSize:11,color:"#20d5ec"'

if old_hero_end in c:
    c = c.replace(old_hero_end, new_section, 1)
    print("OK - comparacion visible agregada")
else:
    print("ERROR")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
