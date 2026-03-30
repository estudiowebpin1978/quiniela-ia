c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Agregar estado para aiInsight
c = c.replace(
    "const [guardadoOk,setGuardadoOk]=useState(false)",
    "const [guardadoOk,setGuardadoOk]=useState(false)\n  const [aiInsight,setAiInsight]=useState(\"\")"
)

# Guardar aiInsight cuando llegan los datos
c = c.replace(
    "setDt(d);setDn(true)",
    "setDt(d);setDn(true);if(d.aiInsight)setAiInsight(d.aiInsight)"
)

# Agregar seccion AI despues del info bar y antes de tips
old = "          <div className=\"tips\">"
new = """          {aiInsight&&<div style={{background:"rgba(32,213,236,.05)",border:"1px solid rgba(32,213,236,.18)",borderRadius:12,padding:"12px 14px",marginBottom:14,display:"flex",gap:10,alignItems:"flex-start"}}>
            <div style={{fontSize:20,flexShrink:0}}>🤖</div>
            <div>
              <div style={{fontSize:10,fontWeight:800,color:"#20d5ec",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Analisis IA</div>
              <div style={{fontSize:12,color:"#e2e8f0",lineHeight:1.7}}>{aiInsight}</div>
            </div>
          </div>}
          <div className="tips">"""

if old in c:
    c = c.replace(old, new, 1)
    print("OK - Groq UI agregado")
else:
    print("ERROR - no encontrado")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
