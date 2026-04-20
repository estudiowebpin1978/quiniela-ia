import { NextRequest, NextResponse } from "next/server"
const SB=()=>(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/"/g,"").trim()
const SK=()=>(process.env.SUPABASE_SERVICE_KEY||"").replace(/"/g,"").trim()
async function isAdmin(token:string):Promise<boolean>{
  try{const r1=await fetch(`${SB()}/auth/v1/user`,{headers:{"apikey":SK(),"Authorization":`Bearer ${token}`}});if(!r1.ok)return false;const user=await r1.json();const r2=await fetch(`${SB()}/rest/v1/user_profiles?id=eq.${user.id}&select=role&limit=1`,{headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`}});const p=await r2.json();return p?.[0]?.role==="admin"}catch{return false}}
export async function GET(req:NextRequest){
  const token=req.headers.get("authorization")?.replace("Bearer ","")||""
  if(!await isAdmin(token))return NextResponse.json({error:"No autorizado"},{status:401})
  try{const r=await fetch(`${SB()}/rest/v1/user_profiles?select=id,email,role,premium_until,created_at&order=created_at.desc&limit=100`,{headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`}});return NextResponse.json({users:await r.json()})}catch(e:any){return NextResponse.json({error:e.message},{status:500})}
}
export async function POST(req:NextRequest){
  const token=req.headers.get("authorization")?.replace("Bearer ","")||""
  if(!await isAdmin(token))return NextResponse.json({error:"No autorizado"},{status:401})
  const body=await req.json()
  const{action,userId,days,email,password,role}=body
  if(action==="create"){
    if(!email||!password)return NextResponse.json({error:"Email y contrasena requeridos"},{status:400})
    try{
      const r=await fetch(`${SB()}/auth/v1/admin/users`,{method:"POST",headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`,"Content-Type":"application/json"},body:JSON.stringify({email,password,email_confirm:true})})
      const data=await r.json()
      if(!r.ok)return NextResponse.json({error:data.msg||data.message||"Error creando usuario"},{status:400})
      const d=Number(days)||30
      const until=role==="admin"?"2099-12-31T00:00:00Z":new Date(Date.now()+d*86400000).toISOString()
      const fr=role||"free"
      await fetch(`${SB()}/rest/v1/user_profiles`,{method:"POST",headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({id:data.id,email,role:fr,premium_until:fr==="free"?null:until})})
      return NextResponse.json({ok:true})
    }catch(e:any){return NextResponse.json({error:e.message},{status:500})}
  }
  if(!userId||!action)return NextResponse.json({error:"Faltan campos"},{status:400})
  let update:any={}
  if(action==="premium"){const d=Number(days)||30;update={role:"premium",premium_until:new Date(Date.now()+d*86400000).toISOString()}}
  else if(action==="admin"){update={role:"admin",premium_until:"2099-12-31T00:00:00Z"}}
  else if(action==="free"){update={role:"free",premium_until:null}}
  else return NextResponse.json({error:"Accion invalida"},{status:400})
  try{const r=await fetch(`${SB()}/rest/v1/user_profiles?id=eq.${userId}`,{method:"PATCH",headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify(update)});if(!r.ok)return NextResponse.json({error:await r.text()},{status:500});return NextResponse.json({ok:true})}catch(e:any){return NextResponse.json({error:e.message},{status:500})}
}
