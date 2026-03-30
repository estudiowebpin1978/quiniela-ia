c = open("app/predictions/page.tsx", encoding="utf-8").read()

# 1. Agregar estado para estadisticas
c = c.replace(
    "const [aiInsight,setAiInsight]=useState(\"\")",
    "const [aiInsight,setAiInsight]=useState(\"\")\n  const [stats,setStats]=useState<any>(null)"
)

# 2. Cargar estadisticas al inicio
c = c.replace(
    "cargarMisPreds(s.access_token)",
    """cargarMisPreds(s.access_token)
      fetch("/api/estadisticas").then(r=>r.json()).then(d=>setStats(d)).catch(()=>{})"""
)

# 3. Mejorar el hero con estadisticas reales
old_sts = """          <div className="sts">
            <div className="sc"><div className="sv">{dt?.totalSorteos||"--"}</div><div className="sl">Sorteos</div></div>
            <div className="sc"><div className="sv">{nums[0]?.numero||"--"}</div><div className="sl">Top 1</div></div>
            <div className="sc"><div className="sv">{pr?"PRO":"FREE"}</div><div className="sl">Acceso</div></div>
          </div>"""

new_sts = """          <div className="sts">
            <div className="sc"><div className="sv">{stats?.pct||"--"}%</div><div className="sl">Aciertos 30 sorteos</div></div>
            <div className="sc"><div className="sv">{stats?.racha||"--"}</div><div className="sl">Racha actual</div></div>
            <div className="sc"><div className="sv">{stats?.totalSorteos||"--"}</div><div className="sl">Sorteos analizados</div></div>
          </div>
          {stats?.mensaje&&<div style={{fontSize:11,color:"#20d5ec",background:"rgba(32,213,236,.07)",border:"1px solid rgba(32,213,236,.2)",borderRadius:20,padding:"5px 14px",marginTop:8,display:"inline-block"}}>{stats.mensaje}</div>}"""

if old_sts in c:
    c = c.replace(old_sts, new_sts, 1)
    print("OK - stats en hero")
else:
    print("ERROR - hero no encontrado")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
