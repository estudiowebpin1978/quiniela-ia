c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Reemplazar stats del hero por datos reales
old = """          <div className="sts">
            <div className="sc"><div className="sv">{stats?.pct||"--"}%</div><div className="sl">Aciertos 30 sorteos</div></div>
            <div className="sc"><div className="sv">{stats?.racha||"--"}</div><div className="sl">Racha actual</div></div>
            <div className="sc"><div className="sv">{stats?.totalSorteos||"--"}</div><div className="sl">Sorteos analizados</div></div>
          </div>
          {stats?.mensaje&&<div style={{fontSize:11,color:"#20d5ec",background:"rgba(32,213,236,.07)",border:"1px solid rgba(32,213,236,.2)",borderRadius:20,padding:"5px 14px",marginTop:8,display:"inline-block"}}>{stats.mensaje}</div>}"""

new = """          <div className="sts">
            <div className="sc"><div className="sv">{stats?.totalSorteos||"--"}</div><div className="sl">Sorteos analizados</div></div>
            <div className="sc"><div className="sv">6</div><div className="sl">Factores del motor</div></div>
            <div className="sc"><div className="sv">365</div><div className="sl">Dias de historial</div></div>
          </div>
          {stats?.desde&&<div style={{fontSize:11,color:"#20d5ec",background:"rgba(32,213,236,.07)",border:"1px solid rgba(32,213,236,.2)",borderRadius:20,padding:"5px 14px",marginTop:8,display:"inline-block"}}>Datos desde {stats.desde} hasta {stats.hasta}</div>}"""

if old in c:
    c = c.replace(old, new, 1)
    print("OK - hero stats actualizado")
else:
    print("ERROR - buscando...")
    idx = c.find("Aciertos 30 sorteos")
    print(repr(c[idx-100:idx+100]) if idx>0 else "no encontrado")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
