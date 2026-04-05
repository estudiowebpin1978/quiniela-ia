c = open("app/predictions/page.tsx", encoding="utf-8").read()

old_rdbl = """            <div className={!pr?"lk":""} style={{minHeight:160}}>
              {rdbl&&(<div className="rdbl">
                <div style={{fontSize:12,color:"#20d5ec",marginBottom:4,fontWeight:700}}>Par optimo recomendado</div>
                <div className="rpair">{rdbl}</div>
                <div style={{fontSize:11,color:"#64748b"}}>Apostale a que ambos aparecen en el mismo sorteo.</div>
              </div>)}
              {r5.length>0&&(<div className="rg">{r5.map((r:any,i:number)=>(<div className="rc" key={i}><div className="rn">{r.numero}</div><div className="rk">{r.significado}</div><div className="rv">{r.veces}x redoblona</div></div>))}</div>)}
              {!pr&&(<div style={{marginTop:12,padding:20,background:"rgba(6,8,15,.93)",backdropFilter:"blur(8px)",borderRadius:14,border:"1px solid rgba(32,213,236,.2)",display:"flex",flexDirection:"column",alignItems:"center",gap:8,textAlign:"center"}}>
                <div style={{fontSize:28}}>🔐</div>
                <div style={{fontWeight:700,color:"#fff"}}>Redoblona Premium</div>
                <a href={WA} target="_blank" rel="noopener noreferrer" className="uc">Activar por WhatsApp</a>
              </div>)}
            </div>"""

new_rdbl = """            <div style={{minHeight:160}}>
              {pr?(<>
                {rdbl&&(<div className="rdbl">
                  <div style={{fontSize:12,color:"#25F4EE",marginBottom:4,fontWeight:700}}>Par optimo recomendado</div>
                  <div className="rpair">{rdbl}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>Apostale a que ambos aparecen en el mismo sorteo.</div>
                </div>)}
                {r5.length>0&&(<div className="rg">{r5.map((r:any,i:number)=>(<div className="rc" key={i}><div className="rn">{r.numero}</div><div className="rk">{r.significado}</div><div className="rv">{r.veces}x redoblona</div></div>))}</div>)}
              </>):(
                <div style={{padding:30,background:"rgba(6,8,15,.95)",backdropFilter:"blur(8px)",borderRadius:14,border:"1px solid rgba(37,244,238,.2)",display:"flex",flexDirection:"column",alignItems:"center",gap:10,textAlign:"center"}}>
                  <div style={{fontSize:36}}>🔐</div>
                  <div style={{fontWeight:800,color:"#fff",fontSize:16}}>Redoblona Premium</div>
                  <div style={{fontSize:12,color:"#94a3b8",maxWidth:200,lineHeight:1.6}}>El par optimo de numeros para redoblona es exclusivo para usuarios Premium.</div>
                  <a href={WA} target="_blank" rel="noopener noreferrer" className="uc" style={{marginTop:4}}>Activar por WhatsApp</a>
                  <div style={{fontSize:10,color:"#475569"}}>Personal Pay: alopez94.ppay — $10.000/mes</div>
                </div>
              )}
            </div>"""

if old_rdbl in c:
    c = c.replace(old_rdbl, new_rdbl, 1)
    print("OK - redoblona bloqueada para free")
else:
    print("ERROR - texto no coincide exactamente")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
