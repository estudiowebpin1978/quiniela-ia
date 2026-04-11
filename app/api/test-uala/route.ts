import { NextResponse } from "next/server"
export async function GET(){
  const userName=process.env.UALA_USERNAME||""
  const clientId=process.env.UALA_CLIENT_ID||""
  const clientSecret=process.env.UALA_CLIENT_SECRET||""
  try{
    const r=await fetch("https://auth.developers.ar.ua.la/v2/api/auth/token",{
      method:"POST",
      headers:{"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify({grant_type:"client_credentials",client_id:clientId,client_secret_id:clientSecret,username:userName}),
      signal:AbortSignal.timeout(10000)
    })
    const data=await r.json()
    return NextResponse.json({status:r.status,hasToken:!!data.access_token,keys:Object.keys(data),data})
  }catch(e:any){return NextResponse.json({error:e.message})}
}
