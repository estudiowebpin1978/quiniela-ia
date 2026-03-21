c = open("app/predictions/page.tsx", encoding="utf-8").read()

old = 'Envia el comprobante por:\n                <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:6,flexWrap:"wrap"}}>\n                  <a href="https://wa.me/5493413514000?text=Hola!%20Pague%20el%20premium%20de%20Quiniela%20IA%20y%20adjunto%20el%20comprobante." target="_blank" rel="noopener noreferrer" style={{padding:"6px 12px",background:"#25D366",color:"#fff",borderRadius:8,fontSize:11,fontWeight:700,textDecoration:"none"}}>WhatsApp</a>'

new = 'Envia el comprobante por:\n                <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:6,flexWrap:"wrap"}}>\n                  <a href="https://wa.me/5493412500029?text=Hola!%20Pague%20el%20premium%20de%20Quiniela%20IA%20y%20adjunto%20el%20comprobante." target="_blank" rel="noopener noreferrer" style={{padding:"6px 12px",background:"#25D366",color:"#fff",borderRadius:8,fontSize:11,fontWeight:700,textDecoration:"none"}}>WhatsApp</a>'

if old in c:
    c = c.replace(old, new, 1)
    print("OK - numero actualizado")
else:
    c = c.replace("5493413514000", "5493412500029")
    print("OK - reemplazo directo")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
