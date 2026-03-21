c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Reemplazar el link de UALA por seccion de multiples pagos
old_cta = """<a href={UALA} target="_blank" rel="noopener noreferrer" className="uc" style={{fontSize:13,padding:"12px 24px"}}>
                Suscribirme $10.000/mes via Uala</a>"""

new_cta = """<div style={{display:"flex",flexDirection:"column",gap:8,width:"100%",maxWidth:340,margin:"0 auto"}}>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:4,textAlign:"center"}}>Elegí tu metodo de pago:</div>
                <a href={UALA} target="_blank" rel="noopener noreferrer" style={{padding:"10px 16px",background:"rgba(201,168,76,.12)",border:"1px solid rgba(201,168,76,.3)",borderRadius:10,color:"#f0cc6e",fontSize:12,fontWeight:700,textDecoration:"none",textAlign:"center"}}>Uala</a>
                <div style={{padding:"10px 16px",background:"rgba(99,102,241,.08)",border:"1px solid rgba(99,102,241,.2)",borderRadius:10,fontSize:11,color:"#a5b4fc",textAlign:"center"}}>
                  Personal Pay: <strong>alopez94.ppay</strong>
                </div>
                <div style={{padding:"10px 16px",background:"rgba(245,158,11,.06)",border:"1px solid rgba(245,158,11,.2)",borderRadius:10,fontSize:11,color:"#fbbf24",textAlign:"center"}}>
                  Naranja X: <strong>ALOPEZ3514.NX.ARS</strong>
                </div>
                <div style={{padding:"10px 16px",background:"rgba(34,197,94,.06)",border:"1px solid rgba(34,197,94,.2)",borderRadius:10,fontSize:11,color:"#86efac",textAlign:"center"}}>
                  Banco Nacion: <strong>fumigacionesrosario</strong>
                </div>
                <div style={{fontSize:10,color:"#64748b",textAlign:"center",marginTop:4}}>
                  Tras el pago envia comprobante a <strong style={{color:"#c9a84c"}}>estudiowebpin@gmail.com</strong><br/>
                  Activacion en menos de 24hs
                </div>
              </div>"""

if old_cta in c:
    c = c.replace(old_cta, new_cta, 1)
    print("CTA principal OK")
else:
    print("CTA principal no encontrada - buscando alternativa...")
    idx = c.find("Suscribirme $10.000/mes via Uala")
    if idx > 0:
        print("Encontrado en:", idx)
        print(repr(c[idx-100:idx+50]))

# Tambien actualizar el lock de premium (3 y 4 cifras)
old_lock = """<a href={UALA} target="_blank" rel="noopener noreferrer" className="uc">Suscribirme $10.000/mes</a>"""
new_lock = """<div style={{fontSize:11,color:"#94a3b8",marginBottom:6}}>Metodos de pago:</div>
                        <a href={UALA} target="_blank" rel="noopener noreferrer" style={{padding:"7px 14px",background:"rgba(201,168,76,.12)",border:"1px solid rgba(201,168,76,.3)",borderRadius:8,color:"#f0cc6e",fontSize:11,fontWeight:600,textDecoration:"none",marginBottom:4,display:"block",textAlign:"center"}}>Uala</a>
                        <div style={{fontSize:10,color:"#a5b4fc",textAlign:"center"}}>Personal Pay: <strong>alopez94.ppay</strong></div>
                        <div style={{fontSize:10,color:"#fbbf24",textAlign:"center"}}>Naranja X: <strong>ALOPEZ3514.NX.ARS</strong></div>
                        <div style={{fontSize:10,color:"#86efac",textAlign:"center"}}>Banco Nacion: <strong>fumigacionesrosario</strong></div>"""

if old_lock in c:
    c = c.replace(old_lock, new_lock)
    print("Lock premium OK")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
