c = open("app/predictions/page.tsx", encoding="utf-8").read()
old = '<button className="no" onClick={logout}>Salir</button>'
new = '{pr&&<a href="/admin" style={{padding:"6px 12px",borderRadius:8,border:"1px solid rgba(201,168,76,.3)",color:"#c9a84c",fontSize:11,fontWeight:600,textDecoration:"none",marginRight:6}}>Panel Admin</a>}<button className="no" onClick={logout}>Salir</button>'
if old in c:
    c = c.replace(old, new, 1)
    print("OK - boton admin agregado")
else:
    print("ERROR - no encontrado")
    idx = c.find("onClick={logout}")
    print("Context:", repr(c[idx-30:idx+40]))
open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
