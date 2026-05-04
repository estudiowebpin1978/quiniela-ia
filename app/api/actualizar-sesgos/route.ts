import { NextRequest, NextResponse } from "next/server"
const SB=()=>(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/"/g,"").trim()
const SK=()=>(process.env.SUPABASE_SERVICE_ROLE_KEY||"").replace(/"/g,"").trim()

export async function GET(req:NextRequest){
  const secret=req.nextUrl.searchParams.get("secret")
  if(secret!=="quiniela2024cron")return NextResponse.json({error:"No autorizado"},{status:401})
  try{
    const r=await fetch(`${SB()}/rest/v1/draws?select=turno,numbers&limit=5000`,{
      headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`}
    })
    const rows=await r.json()
    if(!rows?.length)return NextResponse.json({error:"Sin datos"},{status:500})

  // Calcular frecuencias por turno
  const turnos=["Previa","Primera","Matutina","Vespertina","Nocturna"]
  const sesgos:Record<string,number[]|={}
  const sesgosMensuales:Record<string,Record<number,number[]>>|={}

  for(const turno of turnos){
    const rows_t=rows.filter((r:any)=>r.turno===turno)
    const freq=new Array(100).fill(0)
    let total=0
    
    // Mensual: sesgos por mes
    const freqMensual:Record<number,number[]|={}
    
    for(const row of rows_t){
      const nums=(row.numbers||[]).map((n:any)=>Number(n)%100)
      const mes=new Date(row.date).getMonth()+1
      if(!freqMensual[mes])freqMensual[mes]=new Array(100).fill(0)
      
      for(const n of nums){
        freq[n]++;total++
        freqMensual[mes][n]++
      }
    }
    
    const esperado=total/100
    // Numeros con sesgo > 20% sobre lo esperado
    sesgos[turno]=freq
      .map((f,i)=>({n:i,pct:total>0?f/total*100:0}))
      .filter(x=>x.pct>1.2*esperado)
      .sort((a,b)=>b.pct-a.pct)
      .map(x=>x.n)
    
    // Sesgos mensuales: por cada mes, números con sesgo > 25%
    sesgosMensuales[turno]={}
    for(const [mes,freq] of Object.entries(freqMensual)){
      const totalMes=freq.reduce((a,b)=>a+b,0)
      const esperadoMes=totalMes/100
      sesgosMensuales[turno][mes]=freq
        .map((f,i)=>({n:i,pct:totalMes>0?f/totalMes*100:0}))
        .filter(x=>x.pct>1.25*esperadoMes)
        .sort((a,b)=>b.pct-a.pct)
        .map(x=>x.n)
    }
  }

  // Guardar en Supabase como configuración
  await fetch(`${SB()}/rest/v1/config?key=eq.sesgos`,{
    method:"DELETE",
    headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`}
  })
  await fetch(`${SB()}/rest/v1/config`,{
    method:"POST",
    headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`,"Content-Type":"application/json","Prefer":"return=minimal"},
    body:JSON.stringify({key:"sesgos",value:JSON.stringify(sesgos),updated_at:new Date().toISOString()})
  })
  
  // Guardar sesgos mensuales
  await fetch(`${SB()}/rest/v1/config?key=eq.sesgos_mensuales`,{
    method:"DELETE",
    headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`}
  })
  await fetch(`${SB()}/rest/v1/config`,{
    method:"POST",
    headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`,"Content-Type":"application/json","Prefer":"return=minimal"},
    body:JSON.stringify({key:"sesgos_mensuales",value:JSON.stringify(sesgosMensuales),updated_at:new Date().toISOString()})
  })
    await fetch(`${SB()}/rest/v1/config`,{
      method:"POST",
      headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`,"Content-Type":"application/json","Prefer":"return=minimal"},
      body:JSON.stringify({key:"sesgos",value:JSON.stringify(sesgos),updated_at:new Date().toISOString()})
    })

    return NextResponse.json({ok:true,sesgos,mensaje:"Sesgos actualizados correctamente"})
  }catch(e:any){return NextResponse.json({error:e.message},{status:500})}
}
