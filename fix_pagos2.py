c = open("app/predictions/page.tsx", encoding="utf-8").read()

old = 'target="_blank" rel="noopener noreferrer" className="uc" style={{fontSize:13,padding:"12px 24px"}}>Suscribirme $10.000/mes via Uala</a>'

new = '''target="_blank" rel="noopener noreferrer" style={{fontSize:13,padding:"12px 24px",background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",borderRadius:10,textDecoration:"none"}}>Uala</a>
              <div style={{display:"flex",flexDirection:"column",gap:6,width:"100%",maxWidth:320,margin:"8px auto 0"}}>
                <div style={{fontSize:11,color:"#94a3b8",textAlign:"center"}}>O transferi a cualquiera de estos alias:</div>
                <div style={{padding:"8px 12px",background:"rgba(99,102,241,.08)",border:"1px solid rgba(99,102,241,.2)",borderRadius:8,fontSize:11,color:"#a5b4fc",textAlign:"center"}}>Personal Pay: <strong>alopez94.ppay</strong></div>
                <div style={{padding:"8px 12px",background:"rgba(245,158,11,.06)",border:"1px solid rgba(245,158,11,.2)",borderRadius:8,fontSize:11,color:"#fbbf24",textAlign:"center"}}>Naranja X: <strong>ALOPEZ3514.NX.ARS</strong></div>
                <div style={{padding:"8px 12px",background:"rgba(34,197,94,.06)",border:"1px solid rgba(34,197,94,.2)",borderRadius:8,fontSize:11,color:"#86efac",textAlign:"center"}}>Banco Nacion: <strong>fumigacionesrosario</strong></div>
                <div style={{fontSize:10,color:"#64748b",textAlign:"center",marginTop:2}}>Envia comprobante a <strong style={{color:"#c9a84c"}}>estudiowebpin@gmail.com</strong> - Activacion en 24hs</div>
              </div>'''

if old in c:
    c = c.replace(old, new, 1)
    print("OK - metodos de pago agregados")
else:
    print("ERROR no encontrado")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
