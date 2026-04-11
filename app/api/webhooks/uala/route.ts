import { NextRequest, NextResponse } from "next/server"
export async function POST(req: NextRequest) {
  const SB=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/"/g,"").trim()
  const SK=(process.env.SUPABASE_SERVICE_ROLE_KEY||"").replace(/"/g,"").trim()
  if(!SB||!SK) return NextResponse.json({error:"Config error"},{status:500})
  let body:any
  try{body=await req.json()}catch{return NextResponse.json({error:"Invalid JSON"},{status:400})}
  const status=body?.status||body?.payment_status||body?.state||""
  if(!["approved","paid","completed","success","confirmed"].includes(String(status).toLowerCase()))
    return NextResponse.json({ok:false,reason:"not approved",status})
  let email=body?.payer?.email||body?.email||body?.customer?.email||""
  if(!email&&body?.description?.startsWith("PREMIUM:")){
    email=body.description.replace("PREMIUM:","").trim()
  }
  if(!email) return NextResponse.json({error:"No email found"},{status:400})
  try{
    const r1=await fetch(`${SB}/auth/v1/admin/users?email=${encodeURIComponent(email)}&limit=1`,{headers:{"apikey":SK,"Authorization":`Bearer ${SK}`}})
    const users=await r1.json()
    const user=users?.users?.[0]||users?.[0]
    if(!user?.id) return NextResponse.json({error:"User not found"},{status:404})
    const until=new Date(Date.now()+30*86400000).toISOString()
    await fetch(`${SB}/rest/v1/user_profiles?id=eq.${user.id}`,{method:"PATCH",headers:{"apikey":SK,"Authorization":`Bearer ${SK}`,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({role:"premium",premium_until:until})})
    return NextResponse.json({ok:true,email,premium_until:until})
  }catch(e:any){return NextResponse.json({error:String(e?.message)},{status:500})}
}
