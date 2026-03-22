c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Buscar y reemplazar la seccion de metodos de pago
# Dejar solo Personal Pay
old_uala = '<a href={UALA} target="_blank" rel="noopener noreferrer" style={{fontSize:13,padding:"12px 24px",background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",borderRadius:10,textDecoration:"none"}}>Uala</a>'
if old_uala in c:
    c = c.replace(old_uala, "", 1)
    print("Uala CTA removido")

# Remover Uala, Naranja X y Banco Nacion de la lista
for old in [
    '<div style={{padding:"8px 12px",background:"rgba(99,102,241,.08)",border:"1px solid rgba(99,102,241,.2)",borderRadius:8,fontSize:11,color:"#a5b4fc",textAlign:"center"}}>Personal Pay: <strong>alopez94.ppay</strong></div>',
    '<div style={{padding:"8px 12px",background:"rgba(245,158,11,.06)",border:"1px solid rgba(245,158,11,.2)",borderRadius:8,fontSize:11,color:"#fbbf24",textAlign:"center"}}>Naranja X: <strong>ALOPEZ3514.NX.ARS</strong></div>',
    '<div style={{padding:"8px 12px",background:"rgba(34,197,94,.06)",border:"1px solid rgba(34,197,94,.2)",borderRadius:8,fontSize:11,color:"#86efac",textAlign:"center"}}>Banco Nacion: <strong>fumigacionesrosario</strong></div>',
]:
    if old in c:
        c = c.replace(old, "", 1)

# Reemplazar con solo Personal Pay bien destacado
old_intro = '<div style={{fontSize:11,color:"#94a3b8",textAlign:"center"}}>O transferi a cualquiera de estos alias:</div>'
new_intro = """<div style={{padding:"14px",background:"rgba(99,102,241,.1)",border:"1px solid rgba(99,102,241,.3)",borderRadius:12,textAlign:"center"}}>
                  <div style={{fontSize:12,color:"#a5b4fc",fontWeight:700,marginBottom:6}}>Paga con Personal Pay</div>
                  <div style={{fontSize:22,fontWeight:900,color:"#e2e8f0",letterSpacing:2,marginBottom:4}}>alopez94.ppay</div>
                  <div style={{fontSize:10,color:"#64748b"}}>Abri tu app bancaria o billetera y transferi al alias</div>
                </div>"""

if old_intro in c:
    c = c.replace(old_intro, new_intro, 1)
    print("OK - solo Personal Pay")
else:
    print("No encontrado - buscando...")
    idx = c.find("alopez94.ppay")
    print(repr(c[idx-100:idx+60]) if idx>0 else "no encontrado")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
