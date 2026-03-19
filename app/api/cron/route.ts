import { NextRequest, NextResponse } from "next/server"
const SB=()=>(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/"/g,"").trim()
const SK=()=>(process.env.SUPABASE_SERVICE_ROLE_KEY||"").replace(/"/g,"").trim()
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
export async function GET(req:NextRequest){
  const secret=req.nextUrl.searchParams.get("secret")
  if(secret!==process.env.CRON_SECRET)return NextResponse.json({error:"Unauthorized"},{status:401})
  const now=new Date(Date.now()-3*3600000)
  const y=now.getFullYear(),mo=String(now.getMonth()+1).padStart(2,"0"),d=String(now.getDate()).padStart(2,"0")
  const fechaStr=`${y}-${mo}-${d}`,fechaUrl=`${d}-${mo}-${String(y).slice(-2)}`
  const hora=now.getHours()
  // Quiniela Nacional Buenos Aires - horarios oficiales
  // Previa: 10:15 | Primera: 12:00 | Matutina: 15:00 | Vespertina: 18:00 | Nocturna: 21:00
  let turnoScrape="Nocturna"
  let turnoNombre="Nocturna"
  if(hora>=10&&hora<12){turnoScrape="Previa";turnoNombre="Previa"}
  else if(hora>=12&&hora<15){turnoScrape="Primera";turnoNombre="Primera"}
  else if(hora>=15&&hora<18){turnoScrape="Matutina";turnoNombre="Matutina"}
  else if(hora>=18&&hora<21){turnoScrape="Vespertina";turnoNombre="Vespertina"}
  const nums=await scrape(fechaUrl,turnoScrape)
  if(nums.length>=5){
    const ok=await save(fechaStr,turnoNombre,nums)
    return NextResponse.json({ok,fechaStr,turno:turnoNombre,total:nums.length,nums:nums.slice(0,5)})
  }
  return NextResponse.json({ok:false,fechaStr,turno:turnoNombre,msg:"Sin datos",total:0})
}
