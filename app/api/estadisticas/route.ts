import { NextResponse } from "next/server"
const SB=()=>(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/"/g,"").trim()
const SK=()=>(process.env.SUPABASE_SERVICE_ROLE_KEY||"").replace(/"/g,"").trim()
export async function GET(){
  try{
    const r=await fetch(`${SB()}/rest/v1/draws?select=date,turno,numbers&order=date.desc&limit=5000`,{
      headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`}
    })
    const rows=await r.json()
    if(!rows?.length)return NextResponse.json({totalSorteos:0,desde:"",hasta:"",mensaje:""})

    const totalSorteos=rows.length
    const desde=rows[rows.length-1]?.date||""
    const hasta=rows[0]?.date||""

    // Contar sorteos por turno
    const porTurno:Record<string,number>={}
    for(const row of rows){
      porTurno[row.turno]=(porTurno[row.turno]||0)+1
    }

    return NextResponse.json({
      totalSorteos,
      desde,
      hasta,
      porTurno,
      mensaje:"Analisis basado en "+totalSorteos+" sorteos reales desde "+desde
    })
  }catch{
    return NextResponse.json({totalSorteos:0,desde:"",hasta:"",mensaje:""})
  }
}
