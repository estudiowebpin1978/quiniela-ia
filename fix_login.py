content = open("app/login/page.tsx", encoding="utf-8").read()

# Reemplazar boton de suscripcion por info de premium
old = """      <div className="sep">Predicciones 3 y 4 cifras + Redoblona<span className="pill">PREMIUM</span></div>
      <a href={UALA} target="_blank" rel="noopener noreferrer" className="uala">Suscribirme $10.000/mes via Uala</a>"""

new = """      <div style={{marginTop:14,padding:"12px",background:"rgba(201,168,76,.06)",border:"1px solid rgba(201,168,76,.15)",borderRadius:10,textAlign:"center"}}>
        <p style={{fontSize:11,color:"#94a3b8",lineHeight:1.6}}>Premium desde <strong style={{color:"#c9a84c"}}>$10.000/mes</strong><br/>Pagá por Uala, Personal Pay, Naranja X o Banco Nacion</p>
      </div>"""

if old in content:
    content = content.replace(old, new, 1)
    print("OK - boton suscripcion removido")
else:
    # Buscar el boton
    idx = content.find("Suscribirme")
    if idx > 0:
        print("Encontrado en:", idx)
        print(repr(content[idx-50:idx+60]))

# Agregar GRATIS en tab de crear cuenta
old2 = '>Crear cuenta</button>'
new2 = '>Crear cuenta <span style={{fontSize:9,color:"#86efac",fontWeight:700}}>GRATIS</span></button>'
if old2 in content:
    content = content.replace(old2, new2, 1)
    print("OK - GRATIS agregado")

open("app/login/page.tsx", "w", encoding="utf-8").write(content)
