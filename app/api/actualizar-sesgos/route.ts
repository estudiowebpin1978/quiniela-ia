import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth"
import { getSupabaseAdmin } from "@/lib/supabase-client"

export async function GET(req:NextRequest){
  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) {
    return unauthorizedResponse()
  }
  try{
    const supabase = getSupabaseAdmin()
    const { data: rows } = await supabase
      .from("draws")
      .select("turno, numbers, date")
      .limit(5000)
    if(!rows?.length)return NextResponse.json({ok:true, message:"Sin datos", sesgos:{}, sesgos_mensuales:{}})

  // Calcular frecuencias por turno
  const turnos=["Previa","Primera","Matutina","Vespertina","Nocturna"]
  const sesgos: Record<string, number[]> = {}
  const sesgosMensuales: Record<string, Record<number, number[]>> = {}

  for(const turno of turnos){
    const rows_t=rows.filter((r: {turno:string; numbers:number[]; date:string})=>r.turno===turno)
    const freq=new Array(100).fill(0)
    let total=0
    
    // Mensual: sesgos por mes
    const freqMensual: Record<number, number[]> = {}
    
    for(const row of rows_t){
      const nums=(row.numbers||[]).map((n:number)=>Number(n)%100).filter((n:number)=>!isNaN(n)&&n>=0&&n<=99)
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
      .filter(x=>x.pct>1.2)
      .sort((a,b)=>b.pct-a.pct)
      .map(x=>x.n)
    
    // Sesgos mensuales: por cada mes, números con sesgo > 25%
    sesgosMensuales[turno]={}
    for(const [mes,freq] of Object.entries(freqMensual)){
      const totalMes=freq.reduce((a,b)=>a+b,0)
      const esperadoMes=totalMes/100
      sesgosMensuales[turno][Number(mes)]=freq
        .map((f,i)=>({n:i,pct:totalMes>0?f/totalMes*100:0}))
        .filter(x=>x.pct>1.25)
        .sort((a,b)=>b.pct-a.pct)
        .map(x=>x.n)
    }
  }

  // Guardar en Supabase como configuración
  await supabase.from("config").upsert({
    key: "sesgos",
    value: JSON.stringify(sesgos),
    updated_at: new Date().toISOString()
  })
  
  // Guardar sesgos mensuales
  await supabase.from("config").upsert({
    key: "sesgos_mensuales",
    value: JSON.stringify(sesgosMensuales),
    updated_at: new Date().toISOString()
  })

    return NextResponse.json({ok:true,sesgos,mensaje:"Sesgos actualizados correctamente"})
  }catch{return NextResponse.json({error:"Error procesando sesgos"},{status:500})}
}
