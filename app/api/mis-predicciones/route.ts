import { NextRequest, NextResponse } from "next/server"
const SB=()=>(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/"/g,"").trim()
const SK=()=>(process.env.SUPABASE_SERVICE_ROLE_KEY||"").replace(/"/g,"").trim()
async function getUserId(token:string):Promise<string|null>{
  try{const r=await fetch(`${SB()}/auth/v1/user`,{headers:{"apikey":SK(),"Authorization":`Bearer ${token}`}});if(!r.ok)return null;const u=await r.json();return u.id||null}catch{return null}
}
export async function GET(req:NextRequest){
  const token=req.headers.get("authorization")?.replace("Bearer ","")||""
  const userId=await getUserId(token)
  if(!userId)return NextResponse.json({error:"No autorizado"},{status:401})
  try{
    const r1=await fetch(`${SB()}/rest/v1/user_predictions?user_id=eq.${userId}&select=*&order=created_at.desc&limit=20`,{headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`}})
    const predictions=await r1.json()
    const results=[]
    for(const pred of predictions){
      const r2=await fetch(`${SB()}/rest/v1/draws?date=eq.${pred.date}&turno=eq.${pred.turno}&select=numbers&limit=1`,{headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`}})
      const draws=await r2.json()
      const draw=draws?.[0]
      let aciertos:any[]=[]
      if(draw?.numbers){
        const reales=draw.numbers.map((n:any)=>String(Number(n)%100).padStart(2,"0"))
        aciertos=pred.numeros.filter((n:string)=>reales.includes(n)).map((n:string)=>({numero:n,puesto:reales.indexOf(n)+1}))
      }
      results.push({id:pred.id,date:pred.date,turno:pred.turno,numeros:pred.numeros,resultado:draw?.numbers?.map((n:any)=>String(Number(n)%100).padStart(2,"0")).slice(0,20)||null,aciertos,acerto:aciertos.length>0,created_at:pred.created_at})
    }
    return NextResponse.json({predictions:results})
  }catch(e:any){return NextResponse.json({error:e.message},{status:500})}
}
export async function POST(req:NextRequest){
  const token=req.headers.get("authorization")?.replace("Bearer ","")||""
  const userId=await getUserId(token)
  if(!userId)return NextResponse.json({error:"No autorizado"},{status:401})
  const{date,turno,numeros}=await req.json()
  if(!date||!turno||!numeros?.length)return NextResponse.json({error:"Faltan campos"},{status:400})
  try{
    const r=await fetch(`${SB()}/rest/v1/user_predictions`,{method:"POST",headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({user_id:userId,date,turno,numeros})})
    if(!r.ok)return NextResponse.json({error:await r.text()},{status:500})
    return NextResponse.json({ok:true})
  }catch(e:any){return NextResponse.json({error:e.message},{status:500})}
}
