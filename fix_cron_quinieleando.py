c = open("app/api/cron/route.ts", encoding="utf-8").read()

# Reemplazar funcion scrape para usar quinieleando
old_scrape = """async function scrape(fechaUrl:string, turno:string):Promise<number[]>{
  try{
    const url=`https://quinielanacional1.com.ar/${fechaUrl}/${turno}`"""

new_scrape = """async function scrapeQuinieleando(fechaDb:string):Promise<Record<string,number[]>>{
  try{
    const url=`https://quinieleando.com.ar/quinielas/nacional/resultados-de-hoy`
    const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(15000)})
    if(!r.ok)return {}
    const html=await r.text()
    const results:Record<string,number[]>={}
    const turnoMap:Record<string,string>={previa:"Previa","la primera":"Primera",primera:"Primera",matutina:"Matutina",vespertina:"Vespertina",nocturna:"Nocturna"}
    // Parse tables
    const tableRegex=/<table[^>]*>([\s\S]*?)<\/table>/gi
    const thRegex=/<th[^>]*>([\s\S]*?)<\/th>/i
    const numRegex=/\b(\d{4})\b/g
    let match
    while((match=tableRegex.exec(html))!==null){
      const tableHtml=match[1]
      const thMatch=thRegex.exec(tableHtml)
      if(!thMatch)continue
      const header=thMatch[1].replace(/<[^>]+>/g,"").toLowerCase()
      let turno=""
      for(const[k,v] of Object.entries(turnoMap)){if(header.includes(k)){turno=v;break}}
      if(!turno)continue
      const nums:number[]=[]
      let nm
      while((nm=numRegex.exec(tableHtml))!==null){
        const n=parseInt(nm[1])
        if(n>=0&&n<=9999&&!nums.includes(n))nums.push(n)
        if(nums.length>=20)break
      }
      if(nums.length>=5)results[turno]=nums
    }
    return results
  }catch{return {}}
}

async function scrape(fechaUrl:string, turno:string):Promise<number[]>{
  try{
    const url=`https://quinielanacional1.com.ar/${fechaUrl}/${turno}`"""

if old_scrape in c:
    c = c.replace(old_scrape, new_scrape, 1)
    print("OK - scrape function updated")
else:
    print("ERROR - buscando...")
    idx = c.find("async function scrape")
    print(repr(c[idx:idx+100]))

# Actualizar el GET handler para intentar quinieleando primero
old_save = """    const nums=await scrape(fechaUrl2,turnoScrape)
    if(nums.length<5)return NextResponse.json({ok:false,fechaStr,turno:turnoNombre,msg:"Sin datos",total:0})"""

new_save = """    // Intentar quinieleando primero
    let nums:number[]=[]
    const resQuinieleando=await scrapeQuinieleando(fechaStr)
    if(resQuinieleando[turnoScrape]?.length>=5){
      nums=resQuinieleando[turnoScrape]
    } else {
      nums=await scrape(fechaUrl2,turnoScrape)
    }
    if(nums.length<5)return NextResponse.json({ok:false,fechaStr,turno:turnoNombre,msg:"Sin datos",total:0})"""

if old_save in c:
    c = c.replace(old_save, new_save, 1)
    print("OK - cron usa quinieleando primero")
else:
    print("ERROR save - buscando...")
    idx = c.find("const nums=await scrape")
    print(repr(c[idx:idx+100]))

open("app/api/cron/route.ts", "w", encoding="utf-8").write(c)
