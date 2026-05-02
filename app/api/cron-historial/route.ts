import { NextRequest, NextResponse } from "next/server"
const SB=()=>(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/"/g,"").trim()
const SK=()=>(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||"").replace(/"/g,"").trim()

const TURNOS_VALIDOS=["Previa","Primera","Matutina","Vespertina","Nocturna"]

async function scrape(fechaUrl:string,turno:string):Promise<number[]>{
  try{
    const res=await fetch(`https://quinielanacional1.com.ar/${fechaUrl}/${turno}`,{headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(8000)})
    if(!res.ok)return[]
    const html=await res.text()
    const idx=html.indexOf('class="veintena"')
    if(idx<0)return[]
    const chunk=html.slice(idx,idx+4000)
    const nums:number[]=[]
    const rx=/class="numero">(\d{4})<\/div>/g
    let mx:RegExpExecArray|null
    while((mx=rx.exec(chunk))!==null){
      const n=parseInt(mx[1])
      if(n>=0&&n<=9999&&nums.indexOf(n)===-1)nums.push(n)
      if(nums.length>=20)break
    }
    return nums
  }catch{return[]}
}

async function save(fechaStr:string,turno:string,nums:number[]):Promise<boolean>{
  if(nums.length<5)return false
  await fetch(`${SB()}/rest/v1/draws?date=eq.${fechaStr}&turno=eq.${turno}`,{method:"DELETE",headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`,"Prefer":"return=minimal"}})
  const r=await fetch(`${SB()}/rest/v1/draws`,{method:"POST",headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({date:fechaStr,turno,numbers:nums})})
  return r.ok
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || ""
  const expected = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro"
  
  if (secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const daysParam = parseInt(req.nextUrl.searchParams.get("days") || "30")
  const maxDays = Math.min(Math.max(daysParam, 1), 60)
  
  const results: any[] = []
  let totalSorteos = 0
  
  // Procesar en batches de 3 días en paralelo
  for (let batchStart = 1; batchStart <= maxDays; batchStart += 3) {
    const batchDays = []
    for (let i = 0; i < 3 && batchStart + i <= maxDays; i++) {
      batchDays.push(batchStart + i)
    }
    
    const batchPromises = batchDays.map(async (d) => {
      const date = new Date()
      date.setDate(date.getDate() - d)
      
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, "0")
      const dd = String(date.getDate()).padStart(2, "0")
      const fechaStr = `${y}-${m}-${dd}`
      const fechaUrl = `${dd}-${m}-${String(y).slice(-2)}`
      
      // Scrape all turnos in parallel
      const turnoPromises = TURNOS_VALIDOS.map(async (turno) => {
        const nums = await scrape(fechaUrl, turno)
        if (nums.length >= 5) {
          const ok = await save(fechaStr, turno, nums)
          return { turno, ok, total: nums.length }
        }
        return { turno, ok: false, total: 0 }
      })
      
      const turnos = await Promise.all(turnoPromises)
      const savedCount = turnos.filter(t => t.ok).length
      
      return { fecha: fechaStr, turnos, savedCount }
    })
    
    const batchResults = await Promise.all(batchPromises)
    for (const br of batchResults) {
      totalSorteos += br.savedCount || 0
      results.push(br)
    }
  }
  
  return NextResponse.json({ 
    ok: true, 
    diasProcesados: maxDays,
    totalSorteosGuardados: totalSorteos,
    results: results.slice(0, 5)
  })
}