import { NextResponse } from "next/server"
const SB=()=>(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/"/g,"").trim()
const SK=()=>(process.env.SUPABASE_SERVICE_ROLE_KEY||"").replace(/"/g,"").trim()
export async function GET(){
  try{
    const SB_URL=SB()
    const SK_KEY=SK()
    if(!SB_URL||!SK_KEY){
      return NextResponse.json({totalSorteos:0,desde:"",hasta:"",mensaje:"",pct:0,racha:0},{status:500})
    }

    const ctrl=new AbortController()
    const timeout=setTimeout(()=>ctrl.abort(),10000)

    const r=await fetch(`${SB_URL}/rest/v1/draws?select=date,turno,numbers&order=date.desc&limit=5000`,{
      headers:{"apikey":SK_KEY,"Authorization":`Bearer ${SK_KEY}`},
      signal:ctrl.signal
    })
    clearTimeout(timeout)

    if(!r.ok){
      return NextResponse.json({totalSorteos:0,desde:"",hasta:"",mensaje:"Error en base de datos",pct:0,racha:0},{status:500})
    }

    const rows=await r.json()
    if(!rows?.length)return NextResponse.json({totalSorteos:0,desde:"",hasta:"",mensaje:"Sin datos disponibles",pct:0,racha:0})

    const totalSorteos=rows.length
    const desde=rows[rows.length-1]?.date||""
    const hasta=rows[0]?.date||""

    // Contar sorteos por turno
    const porTurno:Record<string,number>={}
    for(const row of rows){
      porTurno[row.turno]=(porTurno[row.turno]||0)+1
    }

    // Calcular aciertos de los ultimos 30 sorteos analizados
    const ultimos30=rows.slice(0,Math.min(30,rows.length))
    let aciertos=0,racha=0,rachaActual=0
    for(const row of ultimos30){
      if(row.acertada){
        aciertos++
        rachaActual++
        if(rachaActual>racha)racha=rachaActual
      }else{
        rachaActual=0
      }
    }
    const pct=ultimos30.length>0?Math.round((aciertos/ultimos30.length)*100):0

    return NextResponse.json({
      totalSorteos,
      desde,
      hasta,
      porTurno,
      pct,
      racha,
      mensaje:`Motor: ${totalSorteos} sorteos analizados. Precision: ${pct}% (ultimos 30).`
    })
  }catch(e:any){
    return NextResponse.json({totalSorteos:0,desde:"",hasta:"",mensaje:"Error al procesar datos",pct:0,racha:0},{status:500})
  }
}
