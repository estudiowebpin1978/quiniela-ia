c = open("app/predictions/page.tsx", encoding="utf-8").read()

c = c.replace(
    "const [dn,setDn]=useState(false)",
    "const [dn,setDn]=useState(false)\n  const [predInfo,setPredInfo]=useState({sorteo:\"\",fecha:\"\",hora:\"\"})"
)

c = c.replace(
    "setDt(d);setDn(true)",
    "setDt(d);setDn(true);setPredInfo({sorteo:d.sorteo||\"\",fecha:new Date().toLocaleDateString(\"es-AR\"),hora:new Date().toLocaleTimeString(\"es-AR\",{hour:\"2-digit\",minute:\"2-digit\"})})"
)

copiar = """  function copiar(){
    if(!dt?.numeros?.length){alert("Primero genera una prediccion");return}
    const lineas=cur.slice(0,dg===2?10:5).map((p:any,i:number)=>"#"+(i+1)+" "+p.numero+" - "+p.significado).join("\\n")
    const rdbl=dt?.redoblona?"\\nRedoblona: "+dt.redoblona:""
    const txt="QUINIELA IA - "+predInfo.sorteo+"\\nFecha: "+predInfo.fecha+" "+predInfo.hora+"\\n\\n"+lineas+rdbl+"\\n\\nhttps://quiniela-ia-two.vercel.app"
    navigator.clipboard.writeText(txt).then(()=>alert("Prediccion copiada!")).catch(()=>{const el=document.createElement("textarea");el.value=txt;document.body.appendChild(el);el.select();document.execCommand("copy");document.body.removeChild(el);alert("Prediccion copiada!")})
  }
"""
c = c.replace("  async function gen(){", copiar + "  async function gen(){", 1)

infobar = """<div style={{background:"rgba(201,168,76,.08)",border:"1px solid rgba(201,168,76,.2)",borderRadius:10,padding:"10px 16px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
    <div style={{fontSize:13,color:"#c9a84c",fontWeight:600}}>
      Sorteo: <span style={{color:"#f0cc6e"}}>{predInfo.sorteo||so}</span>
      <span style={{margin:"0 10px",opacity:.3}}>|</span>
      <span style={{color:"#e2e8f0"}}>{predInfo.fecha}</span>
      <span style={{margin:"0 6px",opacity:.3}}>-</span>
      <span style={{color:"#94a3b8",fontSize:11}}>{predInfo.hora}</span>
    </div>
    <button onClick={copiar} style={{padding:"6px 14px",background:"rgba(201,168,76,.12)",border:"1px solid rgba(201,168,76,.3)",borderRadius:8,color:"#c9a84c",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
      Copiar prediccion
    </button>
  </div>
  """
c = c.replace('<div className="tbs">', infobar + '<div className="tbs">', 1)

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
print("OK - cambios aplicados")
