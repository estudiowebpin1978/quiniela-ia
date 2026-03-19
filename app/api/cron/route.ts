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
    return[...chunk.matchAll(/class="numero">(\d{4})<\/div>/g)].map(m=>parseInt(m[1])).filter((n,i,a)=>n>=0&&n<=9999&&a.indexOf(n)===i).slice(0,20)
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
  const y=now.getFullYear(),m=String(now.getMonth()+1).padStart(2,"0"),d=String(now.getDate()).padStart(2,"0")
  const fechaStr=`${y}-${m}-${d}`,fechaUrl=`${d}-${m}-${String(y).slice(-2)}`
  const hora=now.getHours()
  let turnos=["Nocturna"]
  if(hora>=10&&hora<12)turnos=["Previa"]
  else if(hora>=12&&hora<15)turnos=["Primera"]
  else if(hora>=15&&hora<18)turnos=["Matutina"]
  else if(hora>=18&&hora<21)turnos=["Vespertina"]
  const results=[]
  for(const turno of turnos){
    const nums=await scrape(fechaUrl,turno)
    if(nums.length>=5){const ok=await save(fechaStr,turno,nums);results.push({turno,ok,total:nums.length,nums:nums.slice(0,5)})}
    else results.push({turno,ok:false,total:0,msg:"Sin datos"})
  }
  return NextResponse.json({ok:true,fechaStr,hora,results})
}
