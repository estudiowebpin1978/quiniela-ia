c = open("app/login/page.tsx", encoding="utf-8").read()

old = """      <div style={{marginTop:14,padding:"12px",background:"rgba(201,168,76,.06)",border:"1px solid rgba(201,168,76,.15)",borderRadius:10,textAlign:"center"}}>
        <p style={{fontSize:11,color:"#94a3b8",lineHeight:1.6}}>Premium desde <strong style={{color:"#c9a84c"}}>$10.000/mes</strong><br/>Pagá por Uala, Personal Pay, Naranja X o Banco Nacion</p>
      </div>"""

new = """      <div style={{marginTop:14,textAlign:"center"}}>
        <p style={{fontSize:11,color:"#475569",lineHeight:1.6}}>Desarrollado por <strong style={{color:"#64748b"}}>Estudio Web Pin</strong><br/><span style={{fontSize:10,color:"#374151"}}>Adrian Hugo Lopez</span></p>
      </div>"""

if old in c:
    c = c.replace(old, new, 1)
    print("OK")
else:
    idx = c.find("Premium desde")
    print("Buscando:", repr(c[idx-50:idx+100]) if idx>0 else "no encontrado")

open("app/login/page.tsx", "w", encoding="utf-8").write(c)
