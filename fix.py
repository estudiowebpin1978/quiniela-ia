c = open("app/predictions/page.tsx", encoding="utf-8").read()
c = c.replace(
    '<button className="no" onClick={logout}>Salir</button>',
    '{pr&&<a href="/admin" style={{padding:"6px 12px",borderRadius:8,border:"1px solid rgba(201,168,76,.3)",color:"#c9a84c",fontSize:11,fontWeight:600,textDecoration:"none",marginRight:6}}>Admin</a>}<button className="no" onClick={logout}>Salir</button>'
)
open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
print("OK" if "/admin" in open("app/predictions/page.tsx").read() else "ERROR - no se aplico")
