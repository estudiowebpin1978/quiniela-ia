c = open("app/predictions/page.tsx", encoding="utf-8").read()

tips = """
              <div style={{background:"rgba(99,102,241,.06)",border:"1px solid rgba(99,102,241,.18)",borderRadius:14,padding:"16px 18px",marginBottom:18}}>
                <div style={{fontSize:13,fontWeight:700,color:"#a5b4fc",marginBottom:12}}> Tips de apuesta sugeridos</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  <div style={{background:"rgba(99,102,241,.08)",borderRadius:10,padding:"10px 8px",textAlign:"center",border:"1px solid rgba(99,102,241,.2)"}}>
                    <div style={{fontSize:10,color:"#a5b4fc",fontWeight:700,marginBottom:6}}>2 CIFRAS</div>
                    <div style={{fontSize:11,color:"#e2e8f0",lineHeight:1.8}}>
                      A primera: <strong style={{color:"#c9a84c"}}>{nums[0]?.numero||"--"}</strong><br/>
                      A los 10: <strong style={{color:"#c9a84c",fontSize:10}}>{nums.slice(0,10).map((n:any)=>n.numero).join(" ")}</strong>
                    </div>
                  </div>
                  <div style={{background:"rgba(201,168,76,.06)",borderRadius:10,padding:"10px 8px",textAlign:"center",border:"1px solid rgba(201,168,76,.18)",position:"relative"}}>
                    {!pr&&<div style={{position:"absolute",top:-8,right:6,background:"#c9a84c",color:"#000",fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:10}}>PRO</div>}
                    <div style={{fontSize:10,color:"#c9a84c",fontWeight:700,marginBottom:6}}>3 CIFRAS</div>
                    {pr?<div style={{fontSize:11,color:"#e2e8f0",lineHeight:1.8}}>A primera: <strong style={{color:"#f0cc6e"}}>{p3[0]||"--"}</strong><br/>A los 5: <strong style={{color:"#f0cc6e",fontSize:10}}>{p3.slice(0,5).join(" ")}</strong></div>:<div style={{fontSize:11,color:"#64748b"}}>Solo Premium</div>}
                  </div>
                  <div style={{background:"rgba(245,158,11,.05)",borderRadius:10,padding:"10px 8px",textAlign:"center",border:"1px solid rgba(245,158,11,.18)",position:"relative"}}>
                    {!pr&&<div style={{position:"absolute",top:-8,right:6,background:"#c9a84c",color:"#000",fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:10}}>PRO</div>}
                    <div style={{fontSize:10,color:"#f59e0b",fontWeight:700,marginBottom:6}}>4 CIFRAS</div>
                    {pr?<div style={{fontSize:11,color:"#e2e8f0",lineHeight:1.8}}>A primera: <strong style={{color:"#fbbf24"}}>{p4[0]||"--"}</strong><br/>A los 5: <strong style={{color:"#fbbf24",fontSize:10}}>{p4.slice(0,5).join(" ")}</strong></div>:<div style={{fontSize:11,color:"#64748b"}}>Solo Premium</div>}
                  </div>
                </div>
                <div style={{fontSize:10,color:"#64748b",marginTop:10,textAlign:"center"}}>A primera paga mas. A los 10/5 aumentan las chances. Combinalos para mejor resultado.</div>
              </div>
"""

c = c.replace('<div className="tbs">', tips + '<div className="tbs">', 1)
open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
print("OK" if "Tips de apuesta" in open("app/predictions/page.tsx", encoding="utf-8").read() else "ERROR")
