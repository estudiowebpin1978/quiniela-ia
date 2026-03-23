c = open("app/admin/page.tsx", encoding="utf-8").read()

# Buscar donde termina el contenido principal para insertar la seccion
# Buscar el ultimo </div> antes del cierre del componente
idx = c.rfind('    </div>\n  </>\n)')
if idx > 0:
    scraper_html = """
    <div className="sec" style={{marginTop:20}}>
      <div className="st">Actualizar datos de sorteos</div>
      <p style={{fontSize:11,color:"#64748b",marginBottom:12}}>Carga los resultados reales de quinielanacional1.com.ar a la base de datos</p>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
        {["Previa","Primera","Matutina","Vespertina","Nocturna"].map((turno:string)=>(
          <button key={turno} onClick={()=>runScraper(turno)} disabled={scraperBusy===turno} style={{padding:"8px 14px",background:"rgba(201,168,76,.1)",border:"1px solid rgba(201,168,76,.3)",borderRadius:8,color:"#c9a84c",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
            {scraperBusy===turno?"Cargando...":turno}
          </button>
        ))}
        <button onClick={()=>runScraper("todos")} disabled={scraperBusy==="todos"} style={{padding:"8px 14px",background:"rgba(99,102,241,.1)",border:"1px solid rgba(99,102,241,.3)",borderRadius:8,color:"#a5b4fc",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          {scraperBusy==="todos"?"Cargando...":"Cargar todos (hoy)"}
        </button>
      </div>
      {scraperMsg&&<div style={{padding:"10px 14px",background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.2)",borderRadius:8,fontSize:12,color:"#86efac",marginTop:8}}>{scraperMsg}</div>}
    </div>
"""
    c = c[:idx] + scraper_html + c[idx:]
    print("OK - seccion scraper agregada")
else:
    print("ERROR - no encontro el lugar")
    print("Ultimos 200 chars:", repr(c[-200:]))

open("app/admin/page.tsx", "w", encoding="utf-8").write(c)
