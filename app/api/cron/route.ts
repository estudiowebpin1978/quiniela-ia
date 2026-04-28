import { NextRequest, NextResponse } from "next/server"
const SB=()=>(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/"/g,"").trim()
const SK=()=>(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||"").replace(/"/g,"").trim()

const TURNOS_VALIDOS=["Previa","Primera","Matutina","Vespertina","Nocturna"]

async function scrape(fechaUrl:string,turno:string):Promise<number[]>{
  try{
    const res=await fetch(`https://quinielanacional1.com.ar/${fechaUrl}/${turno}`,{headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(12000)})
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
  await fetch(`${SB()}/rest/v1/draws?date=eq.${fechaStr}&turno=eq.${turno}`,{method:"DELETE",headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`,"Prefer":"return=minimal"}})
  const r=await fetch(`${SB()}/rest/v1/draws`,{method:"POST",headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({date:fechaStr,turno,numbers:nums})})
  return r.ok
}
  
function authorizeCron(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const q = req.nextUrl.searchParams.get("secret")
  const h = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  const x = req.headers.get("x-cron-secret") ?? ""
  return q === expected || h === expected || x === expected
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  
  const dateParam = req.nextUrl.searchParams.get("date")
  const daysParam = parseInt(req.nextUrl.searchParams.get("days") || "1")
  const historyParam = req.nextUrl.searchParams.get("history") === "true"
  const forceParam = req.nextUrl.searchParams.get("force") === "true"
  
  const days = Math.min(Math.max(daysParam, 1), 90)
  const results: any[] = []
  let guardados = 0
  let errores = 0
  let saltados = 0
  
  if (historyParam) {
    for (let i = 0; i < days; i++) {
      const now = new Date()
      now.setDate(now.getDate() - i)
      const y = now.getFullYear()
      const mo = String(now.getMonth() + 1).padStart(2, "0")
      const d = String(now.getDate()).padStart(2, "0")
      const fechaStr = `${y}-${mo}-${d}`
      const fechaUrl = `${d}-${mo}-${String(y).slice(-2)}`
      
      const dayResults: any = { fecha: fechaStr, turnos: [] }
      
      for (const t of TURNOS_VALIDOS) {
        const nums = await scrape(fechaUrl, t)
        if (nums.length >= 5) {
          if (forceParam) {
            const ok = await save(fechaStr, t, nums)
            if (ok) {
              guardados++
              dayResults.turnos.push({ turno: t, ok: true, total: nums.length })
            } else {
              errores++
              dayResults.turnos.push({ turno: t, ok: false, total: 0 })
            }
          } else {
            guardados++
            dayResults.turnos.push({ turno: t, ok: true, total: nums.length })
          }
        } else {
          saltados++
          dayResults.turnos.push({ turno: t, ok: false, total: 0 })
        }
      }
      results.push(dayResults)
    }
    
    return NextResponse.json({ 
      ok: guardados > 0, 
      totalDays: days,
      guardados,
      errores, 
      saltados,
      results 
    })
  }
  
  const now = dateParam ? new Date(dateParam + 'T00:00:00') : new Date(Date.now() - 3 * 3600000)
  const y = now.getFullYear()
  const mo = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  const fechaStr = `${y}-${mo}-${d}`
  const fechaUrl = `${d}-${mo}-${String(y).slice(-2)}`
  const hora = now.getHours()
  
  const turnoParam = req.nextUrl.searchParams.get("turno")
  let turnoScrape = "Nocturna"
  let turnoNombre = "Nocturna"
  
  if (turnoParam && TURNOS_VALIDOS.includes(turnoParam)) {
    turnoScrape = turnoParam
    turnoNombre = turnoParam
  } else {
    if (hora >= 10 && hora < 12) { turnoScrape = "Previa"; turnoNombre = "Previa" }
    else if (hora >= 12 && hora < 15) { turnoScrape = "Primera"; turnoNombre = "Primera" }
    else if (hora >= 15 && hora < 18) { turnoScrape = "Matutina"; turnoNombre = "Matutina" }
    else if (hora >= 18 && hora < 21) { turnoScrape = "Vespertina"; turnoNombre = "Vespertina" }
  }
  
  if (turnoParam === "todos") {
    const resultsTodos = []
    const fechaUrl2 = `${d}-${mo}-${String(y).slice(-2)}`
    for (const t of TURNOS_VALIDOS) {
      const nums = await scrape(fechaUrl2, t)
      if (nums.length >= 5) {
        const ok = await save(fechaStr, t, nums)
        resultsTodos.push({ turno: t, ok, total: nums.length })
      }
      else resultsTodos.push({ turno: t, ok: false, total: 0 })
    }
    return NextResponse.json({ ok: true, fechaStr, results: resultsTodos })
  }
  
  const nums = await scrape(fechaUrl, turnoScrape)
  if (nums.length >= 5) {
    const ok = await save(fechaStr, turnoNombre, nums)
    return NextResponse.json({ ok, fechaStr, turno: turnoNombre, total: nums.length, nums: nums.slice(0, 5) })
  }
  return NextResponse.json({ ok: false, fechaStr, turno: turnoNombre, msg: "Sin datos", total: 0 })
}
