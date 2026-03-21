c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Buscar el footer existente
old = '<div className="ft"><p>Soporte: <a href={"mailto:"+CONTACT}>{CONTACT}</a></p>'
new = '<div className="ft"><p>Soporte: <a href={"mailto:"+CONTACT}>{CONTACT}</a></p><div style={{fontSize:10,color:"#475569",marginTop:12,lineHeight:1.7,textAlign:"center",padding:"10px",borderTop:"1px solid rgba(255,255,255,.05)"}}>Herramienta de analisis estadistico con fines informativos. No realiza apuestas ni maneja dinero. La Quiniela de la Ciudad es administrada por la Loteria de la Ciudad de Buenos Aires. El juego en exceso puede causar adiccion. Linea de ayuda gratuita: <strong style={{color:"#c9a84c"}}>0800-333-0062</strong>. Solo mayores de 18 anos.</div>'

if old in c:
    c = c.replace(old, new, 1)
    print("OK - disclaimer agregado")
else:
    idx = c.find("CONTACT}</a></p>")
    print("Contexto:", repr(c[idx-20:idx+40]))

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
