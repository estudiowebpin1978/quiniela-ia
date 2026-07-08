import { NextRequest, NextResponse } from "next/server"
const SB=()=>(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/"/g,"").trim()
const SK=()=>(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||"").replace(/"/g,"").trim()

const rateMap=new Map<string,{count:number;reset:number}>()
function checkRate(ip:string,max=10,windowMs=60000):boolean{
  const now=Date.now()
  const entry=rateMap.get(ip)
  if(!entry||now>entry.reset){rateMap.set(ip,{count:1,reset:now+windowMs});return true}
  if(entry.count>=max)return false
  entry.count++
  return true
}

async function isAdmin(token:string):Promise<boolean>{
  const adminEmail=(process.env.ADMIN_EMAIL||"estudiowebpin@gmail.com").toLowerCase()
  try{const r1=await fetch(`${SB()}/auth/v1/user`,{headers:{"apikey":SK(),"Authorization":`Bearer ${token}`}});if(!r1.ok)return false;const user=await r1.json();return user.email?.toLowerCase()===adminEmail}catch{return false}
}

export async function GET(req:NextRequest){
  const token=req.headers.get("authorization")?.replace("Bearer ","")||""
  if(!await isAdmin(token))return NextResponse.json({error:"No autorizado"},{status:401})
  try{const r=await fetch(`${SB()}/rest/v1/user_profiles?select=id,email,role,premium_until,created_at&order=created_at.desc&limit=100`,{headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`}});return NextResponse.json({users:await r.json()})}catch(e:any){return NextResponse.json({error:e.message},{status:500})}
}

export async function POST(req:NextRequest){
  const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||req.headers.get("x-real-ip")||"unknown"
  if(!checkRate(ip))return NextResponse.json({error:"Demasiadas peticiones. Intentá en 1 minuto."},{status:429})

  const token=req.headers.get("authorization")?.replace("Bearer ","")||""
  if(!await isAdmin(token))return NextResponse.json({error:"No autorizado"},{status:401})

  let body:any
  try{body=await req.json()}catch{return NextResponse.json({error:"JSON inválido"},{status:400})}
  const{action,userId,days,email,password,role}=body

  if(action==="create"){
    if(!email||!password)return NextResponse.json({error:"Email y contrasena requeridos"},{status:400})
    const safeRole=(role==="admin")?"free":(role||"free")
    try{
      const r=await fetch(`${SB()}/auth/v1/admin/users`,{method:"POST",headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`,"Content-Type":"application/json"},body:JSON.stringify({email,password,email_confirm:true})})
      const data=await r.json()
      if(!r.ok)return NextResponse.json({error:data.msg||data.message||"Error creando usuario"},{status:400})
      const d=Number(days)||30
      const until=safeRole==="free"?null:new Date(Date.now()+d*86400000).toISOString()
      await fetch(`${SB()}/rest/v1/user_profiles`,{method:"POST",headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({id:data.id,email,role:safeRole,premium_until:until})})
      return NextResponse.json({ok:true})
    }catch(e:any){return NextResponse.json({error:e.message},{status:500})}
  }

  if(!userId||!action)return NextResponse.json({error:"Faltan campos"},{status:400})
  let update:any={}
  if(action==="premium"){const d=Number(days)||30;update={role:"premium",premium_until:new Date(Date.now()+d*86400000).toISOString()}}
  else if(action==="free"){update={role:"free",premium_until:null}}
  else return NextResponse.json({error:"Accion invalida. Solo: premium, free"},{status:400})

  try{const r=await fetch(`${SB()}/rest/v1/user_profiles?id=eq.${userId}`,{method:"PATCH",headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify(update)});if(!r.ok)return NextResponse.json({error:await r.text()},{status:500});return NextResponse.json({ok:true})}catch(e:any){return NextResponse.json({error:e.message},{status:500})}
}
