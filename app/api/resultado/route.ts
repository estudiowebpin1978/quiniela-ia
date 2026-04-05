import { NextRequest, NextResponse } from "next/server"
const SB=()=>(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/"/g,"").trim()
const SK=()=>(process.env.SUPABASE_SERVICE_ROLE_KEY||"").replace(/"/g,"").trim()
export async function GET(req:NextRequest){
  const{searchParams}=new URL(req.url)
  const date=searchParams.get("date")
  const turno=searchParams.get("turno")
  if(!date||!turno)return NextResponse.json({error:"Faltan parametros"},{status:400})
  try{
    const r=await fetch(`${SB()}/rest/v1/draws?date=eq.${date}&turno=eq.${encodeURIComponent(turno)}&select=numbers&limit=1`,{
      headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`}
    })
    const data=await r.json()
    if(!data?.[0]?.numbers?.length)return NextResponse.json({found:false})
    return NextResponse.json({found:true,numbers:data[0].numbers})
  }catch(e:any){return NextResponse.json({error:e.message},{status:500})}
}
