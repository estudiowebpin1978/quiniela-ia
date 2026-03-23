c = open("app/admin/page.tsx", encoding="utf-8").read()

# Agregar seccion de scraper antes del cierre del div principal
scraper_section = """
    <div className="sec" style={{marginTop:20}}>
      <div className="st">Actualizar datos de sorteos</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
        {["Previa","Primera","Matutina","Vespertina","Nocturna"].map(turno=>(
          <button key={turno} onClick={()=>runScraper(turno)} disabled={scraperBusy===turno} style={{padding:"8px 16px",background:"rgba(201,168,76,.1)",border:"1px solid rgba(201,168,76,.3)",borderRadius:8,color:"#c9a84c",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
            {scraperBusy===turno?"Cargando...":turno}
          </button>
        ))}
        <button onClick={()=>runScraper("todos")} disabled={scraperBusy==="todos"} style={{padding:"8px 16px",background:"rgba(99,102,241,.1)",border:"1px solid rgba(99,102,241,.3)",borderRadius:8,color:"#a5b4fc",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          {scraperBusy==="todos"?"Cargando todos...":"Cargar todos (3 dias)"}
        </button>
      </div>
      {scraperMsg&&<div style={{padding:"10px 14px",background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.2)",borderRadius:8,fontSize:12,color:"#86efac"}}>{scraperMsg}</div>}
    </div>
"""

c = c.replace("    </div>\n  </>\n)", scraper_section + "    </div>\n  </>\n)")

# Agregar estado y funcion del scraper
c = c.replace(
    "const [creating,setCreating]=useState(false)",
    "const [creating,setCreating]=useState(false)\n  const [scraperBusy,setScraperBusy]=useState<string|null>(null)\n  const [scraperMsg,setScraperMsg]=useState(\"\")"
)

scraper_fn = """
  async function runScraper(turno:string){
    setScraperBusy(turno);setScraperMsg("")
    try{
      const days = turno==="todos"?3:1
      const r=await fetch(`/api/cron?secret=quiniela2024cron&turno=${turno}&days=${days}`,{headers:{Authorization:"Bearer "+token}})
      const d=await r.json()
      if(d.ok){setScraperMsg("OK - "+JSON.stringify(d.results||d))}
      else{setScraperMsg("Error: "+JSON.stringify(d))}
    }catch(e:any){setScraperMsg("Error: "+e.message)}
    setScraperBusy(null)
  }
"""

c = c.replace("  async function load(tk:string){", scraper_fn + "  async function load(tk:string){", 1)

open("app/admin/page.tsx", "w", encoding="utf-8").write(c)
print("OK" if "runScraper" in open("app/admin/page.tsx", encoding="utf-8").read() else "ERROR")
