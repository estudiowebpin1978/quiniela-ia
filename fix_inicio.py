# 1. Eliminar seccion "Ultimo analisis" de predictions
c = open("app/predictions/page.tsx", encoding="utf-8").read()

import re
# Eliminar el bloque de ultimoRes
old_res = """{ultimoRes?.numeros?.length>0&&<div style={{background:"rgba(255,45,85,.04)",border:"1px solid rgba(255,45,85,.15)",borderRadius:12,padding:"10px 14px",marginTop:10,textAlign:"center"}}>
            <div style={{fontSize:10,color:"#ff6b81",fontWeight:700,marginBottom:6}}>Ultimo analisis — {ultimoRes.sorteo}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center"}}>
              {ultimoRes.numeros.slice(0,5).map((n:any,i:number)=>(
                <span key={i} style={{background:"rgba(255,45,85,.15)",color:"#ff6b81",padding:"3px 8px",borderRadius:6,fontSize:12,fontWeight:800}}>{n.numero}</span>
              ))}
            </div>
            <div style={{fontSize:9,color:"#475569",marginTop:5}}>Toca Generar Prediccion para analisis completo</div>
          </div>}"""

if old_res in c:
    c = c.replace(old_res, "", 1)
    print("OK - ultimo analisis eliminado")
else:
    print("buscando ultimoRes...")
    idx = c.find("ultimoRes")
    if idx > 0:
        print(repr(c[idx:idx+100]))

# Eliminar estado ultimoRes y fetch
c = c.replace(
    "\n  const [ultimoRes,setUltimoRes]=useState<any>(null)",
    ""
)
c = c.replace(
    """\n      fetch("/api/predictions?sorteo="+so).then(r=>r.json()).then(d=>{
        if(d?.numeros?.length>0)setUltimoRes(d)
      }).catch(()=>{})""",
    ""
)

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
print("predictions OK")
