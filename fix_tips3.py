c = open("app/predictions/page.tsx", encoding="utf-8").read()

old_tips_start = c.find('<div style={{background:"rgba(99,102,241,.06)",border:"1px solid rgba(99,102,241,.18)"')
old_tips_end = c.find('A primera paga mas pero es mas dificil.')
old_tips_end = c.find('</div>\n', old_tips_end) + 7
old_tips_end = c.find('</div>\n', old_tips_end) + 7

new_tips = """<div style={{background:"rgba(99,102,241,.06)",border:"1px solid rgba(99,102,241,.18)",borderRadius:14,padding:"16px 18px",marginBottom:18}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:6}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#a5b4fc"}}> Tips de apuesta sugeridos</div>
                  <div style={{fontSize:11,color:"#c9a84c",background:"rgba(201,168,76,.1)",padding:"4px 10px",borderRadius:20,border:"1px solid rgba(201,168,76,.25)"}}>
                    Para: {proximoSorteo(so)}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  <div style={{background:"rgba(99,102,241,.08)",borderRadius:10,padding:"12px 8px",border:"1px solid rgba(99,102,241,.2)"}}>
                    <div style={{fontSize:10,color:"#a5b4fc",fontWeight:700,marginBottom:8,textAlign:"center"}}>2 CIFRAS</div>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Jugalos a primera Y a los 10:</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                      {nums.slice(0,10).map((n:any,i:number)=>(
                        <span key={i} style={{background:"rgba(201,168,76,.15)",color:"#f0cc6e",padding:"2px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{n.numero}</span>
                      ))}
                    </div>
                    <div style={{fontSize:10,color:"#64748b",marginTop:6}}>Pone el 1ro a primera y los 10 a los 10</div>
                  </div>
                  <div style={{background:"rgba(201,168,76,.06)",borderRadius:10,padding:"12px 8px",border:"1px solid rgba(201,168,76,.18)",position:"relative"}}>
                    {!pr&&<div style={{position:"absolute",top:-8,right:6,background:"#c9a84c",color:"#000",fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:10}}>PRO</div>}
                    <div style={{fontSize:10,color:"#c9a84c",fontWeight:700,marginBottom:8,textAlign:"center"}}>3 CIFRAS</div>
                    {pr?<><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Jugalos a primera Y a los 5:</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                      {p3.slice(0,5).map((n:string,i:number)=>(
                        <span key={i} style={{background:"rgba(201,168,76,.15)",color:"#f0cc6e",padding:"2px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{n}</span>
                      ))}
                    </div>
                    <div style={{fontSize:10,color:"#64748b",marginTop:6}}>Pone el 1ro a primera y los 5 a los 5</div>
                    </>:<div style={{textAlign:"center",marginTop:16}}><a href={UALA} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#c9a84c",textDecoration:"none",background:"rgba(201,168,76,.1)",padding:"6px 12px",borderRadius:8,border:"1px solid rgba(201,168,76,.25)"}}>Activar Premium</a></div>}
                  </div>
                  <div style={{background:"rgba(245,158,11,.05)",borderRadius:10,padding:"12px 8px",border:"1px solid rgba(245,158,11,.18)",position:"relative"}}>
                    {!pr&&<div style={{position:"absolute",top:-8,right:6,background:"#c9a84c",color:"#000",fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:10}}>PRO</div>}
                    <div style={{fontSize:10,color:"#f59e0b",fontWeight:700,marginBottom:8,textAlign:"center"}}>4 CIFRAS</div>
                    {pr?<><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Jugalos a primera Y a los 5:</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                      {p4.slice(0,5).map((n:string,i:number)=>(
                        <span key={i} style={{background:"rgba(245,158,11,.12)",color:"#fbbf24",padding:"2px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{n}</span>
                      ))}
                    </div>
                    <div style={{fontSize:10,color:"#64748b",marginTop:6}}>Pone el 1ro a primera y los 5 a los 5</div>
                    </>:<div style={{textAlign:"center",marginTop:16}}><a href={UALA} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#c9a84c",textDecoration:"none",background:"rgba(201,168,76,.1)",padding:"6px 12px",borderRadius:8,border:"1px solid rgba(201,168,76,.25)"}}>Activar Premium</a></div>}
                  </div>
                </div>
                <div style={{fontSize:10,color:"#475569",marginTop:10,textAlign:"center",lineHeight:1.6}}>
                  Apostando a primera paga mas pero es mas dificil. Apostando a los 10/5 aumentas las chances de acertar.
                </div>
              </div>
"""

if old_tips_start > 0:
    c = c[:old_tips_start] + new_tips + c[old_tips_end:]
    print("OK")
else:
    print("ERROR: no encontro tips")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
