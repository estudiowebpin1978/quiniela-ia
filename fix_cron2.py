c = open("app/api/cron/route.ts", encoding="utf-8").read()

# Agregar soporte para turno especifico por parametro
old = "  let turnoScrape=\"Nocturna\"\n  let turnoNombre=\"Nocturna\"\n  if(hora>=10&&hora<12){turnoScrape=\"Previa\";turnoNombre=\"Previa\"}\n  else if(hora>=12&&hora<15){turnoScrape=\"Primera\";turnoNombre=\"Primera\"}\n  else if(hora>=15&&hora<18){turnoScrape=\"Matutina\";turnoNombre=\"Matutina\"}\n  else if(hora>=18&&hora<21){turnoScrape=\"Vespertina\";turnoNombre=\"Vespertina\"}"

new = """  const turnoParam=req.nextUrl.searchParams.get("turno")
  const TURNOS_VALIDOS=["Previa","Primera","Matutina","Vespertina","Nocturna"]
  let turnoScrape="Nocturna"
  let turnoNombre="Nocturna"
  if(turnoParam&&TURNOS_VALIDOS.includes(turnoParam)){
    turnoScrape=turnoParam;turnoNombre=turnoParam
  } else {
    if(hora>=10&&hora<12){turnoScrape="Previa";turnoNombre="Previa"}
    else if(hora>=12&&hora<15){turnoScrape="Primera";turnoNombre="Primera"}
    else if(hora>=15&&hora<18){turnoScrape="Matutina";turnoNombre="Matutina"}
    else if(hora>=18&&hora<21){turnoScrape="Vespertina";turnoNombre="Vespertina"}
  }
  if(turnoParam==="todos"){
    const resultsTodos=[]
    const fechaUrl2=`${d}-${mo}-${String(y).slice(-2)}`
    for(const t of TURNOS_VALIDOS){
      const nums=await scrape(fechaUrl2,t)
      if(nums.length>=5){const ok=await save(fechaStr,t,nums);resultsTodos.push({turno:t,ok,total:nums.length})}
      else resultsTodos.push({turno:t,ok:false,total:0})
    }
    return NextResponse.json({ok:true,fechaStr,results:resultsTodos})
  }"""

if old in c:
    c = c.replace(old, new, 1)
    print("OK - cron actualizado con soporte turno")
else:
    print("No encontrado exacto - aplicando reemplazo simple")
    c = c.replace(
        'const turnoParam=req.nextUrl.searchParams.get("secret")',
        'const turnoParam=req.nextUrl.searchParams.get("secret")'
    )
    # Agregar al inicio del handler
    idx = c.find('const now=new Date')
    new_code = """  const turnoParam=req.nextUrl.searchParams.get("turno")
  const TURNOS_VALIDOS=["Previa","Primera","Matutina","Vespertina","Nocturna"]
"""
    c = c[:idx] + new_code + c[idx:]
    print("Codigo de turno agregado al inicio")

open("app/api/cron/route.ts", "w", encoding="utf-8").write(c)
