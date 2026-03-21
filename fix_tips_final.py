c = open("app/predictions/page.tsx", encoding="utf-8").read()

# 1. Agregar funcion proximoSorteo antes de return
prox_fn = """
  function proximoSorteo(sorteo:string):string {
    const ar = new Date(Date.now() - 3*3600000)
    const hora = ar.getHours()*100 + ar.getMinutes()
    const hoy = ar.toLocaleDateString("es-AR",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"})
    const manana = new Date(ar.getTime()+86400000).toLocaleDateString("es-AR",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"})
    if(sorteo==="Todos") return "proximo sorteo"
    const h:Record<string,number>={Previa:1015,Primera:1200,Matutina:1500,Vespertina:1800,Nocturna:2100}
    return hora < (h[sorteo]||2100) ? sorteo+" del "+hoy : sorteo+" del "+manana
  }
"""
c = c.replace("  return(<>", prox_fn + "  return(<>", 1)

# 2. Agregar seccion tips despues de la barra de info (antes de las tabs)
tips = """
              <div style={{background:"rgba(99,102,241,.06)",border:"1px solid rgba(99,102,241,.18)",borderRadius:14,padding:"14px 16px",marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:6}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#a5b4fc"}}> Tips de apuesta</div>
                  <div style={{fontSize:10,color:"#c9a84c",background:"rgba(201,168,76,.1)",padding:"3px 9px",borderRadius:20,border:"1px solid rgba(201,168,76,.25)"}}>Para: {proximoSorteo(so)}</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  <div style={{background:"rgba(99,102,241,.08)",borderRadius:10,padding:"10px 6px",border:"1px solid rgba(99,102,241,.2)"}}>
                    <div style={{fontSize:9,color:"#a5b4fc",fontWeight:700,marginBottom:6,textAlign:"center"}}>2 CIFRAS</div>
                    <div style={{fontSize:9,color:"#94a3b8",marginBottom:4}}>A primera y a los 10:</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:2}}>
                      {nums.slice(0,10).map((n:any,i:number)=>(
                        <span key={i} style={{background:"rgba(201,168,76,.15)",color:"#f0cc6e",padding:"1px 5px",borderRadius:4,fontSize:10,fontWeight:700}}>{n.numero}</span>
                      ))}
                    </div>
                    <div style={{fontSize:9,color:"#475569",marginTop:5}}>El 1ro a primera, los 10 a los 10</div>
                  </div>
                  <div style={{background:"rgba(201,168,76,.06)",borderRadius:10,padding:"10px 6px",border:"1px solid rgba(201,168,76,.18)",position:"relative"}}>
                    {!pr&&<div style={{position:"absolute",top:-7,right:4,background:"#c9a84c",color:"#000",fontSize:7,fontWeight:700,padding:"1px 5px",borderRadius:8}}>PRO</div>}
                    <div style={{fontSize:9,color:"#c9a84c",fontWeight:700,marginBottom:6,textAlign:"center"}}>3 CIFRAS</div>
                    {pr?<><div style={{fontSize:9,color:"#94a3b8",marginBottom:4}}>A primera y a los 5:</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:2}}>{p3.slice(0,5).map((n:string,i:number)=>(<span key={i} style={{background:"rgba(201,168,76,.15)",color:"#f0cc6e",padding:"1px 5px",borderRadius:4,fontSize:10,fontWeight:700}}>{n}</span>))}</div>
                    <div style={{fontSize:9,color:"#475569",marginTop:5}}>El 1ro a primera, los 5 a los 5</div>
                    </>:<div style={{textAlign:"center",paddingTop:8}}><a href="https://pagar.ualabis.com.ar/order/df50920d5961bd85d19f4231747cc5d7e6ca0489da6e76a4" target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"#c9a84c",textDecoration:"none"}}>Activar Premium</a></div>}
                  </div>
                  <div style={{background:"rgba(245,158,11,.05)",borderRadius:10,padding:"10px 6px",border:"1px solid rgba(245,158,11,.18)",position:"relative"}}>
                    {!pr&&<div style={{position:"absolute",top:-7,right:4,background:"#c9a84c",color:"#000",fontSize:7,fontWeight:700,padding:"1px 5px",borderRadius:8}}>PRO</div>}
                    <div style={{fontSize:9,color:"#f59e0b",fontWeight:700,marginBottom:6,textAlign:"center"}}>4 CIFRAS</div>
                    {pr?<><div style={{fontSize:9,color:"#94a3b8",marginBottom:4}}>A primera y a los 5:</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:2}}>{p4.slice(0,5).map((n:string,i:number)=>(<span key={i} style={{background:"rgba(245,158,11,.12)",color:"#fbbf24",padding:"1px 5px",borderRadius:4,fontSize:10,fontWeight:700}}>{n}</span>))}</div>
                    <div style={{fontSize:9,color:"#475569",marginTop:5}}>El 1ro a primera, los 5 a los 5</div>
                    </>:<div style={{textAlign:"center",paddingTop:8}}><a href="https://pagar.ualabis.com.ar/order/df50920d5961bd85d19f4231747cc5d7e6ca0489da6e76a4" target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"#c9a84c",textDecoration:"none"}}>Activar Premium</a></div>}
                  </div>
                </div>
                <div style={{fontSize:9,color:"#475569",marginTop:8,textAlign:"center"}}>A primera paga mas. A los 10/5 aumentas las chances. Combinalos.</div>
              </div>
"""

# Insert tips before tabs
c = c.replace('<div className="tbs">', tips + '<div className="tbs">', 1)

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
print("OK" if "proximoSorteo" in open("app/predictions/page.tsx", encoding="utf-8").read() else "ERROR")
