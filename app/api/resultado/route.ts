import { NextRequest, NextResponse } from "next/server"
const SB=()=>(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/"/g,"").trim()
const SK=()=>(process.env.SUPABASE_SERVICE_ROLE_KEY||"").replace(/"/g,"").trim()

export async function GET(req:NextRequest){
  console.log("=== DEBUG resultado ===")
  console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "SET" : "NOT SET")
  console.log("SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "SET" : "NOT SET")
  console.log("========================")

  const{searchParams}=new URL(req.url)
  const date=searchParams.get("date")
  const turno=searchParams.get("turno")

  // Validar parámetros
  if(!date||!turno){
    return NextResponse.json({
      found:false,
      error:"Parámetros requeridos: date (YYYY-MM-DD) y turno"
    },{status:400})
  }

  // Validar formato de fecha
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){
    return NextResponse.json({
      found:false,
      error:"Formato de fecha inválido (YYYY-MM-DD)"
    },{status:400})
  }

  try{
    const SB_URL=SB()
    const SK_KEY=SK()
    if(!SB_URL||!SK_KEY){
      return NextResponse.json({
        found:false,
        error:"Configuración incompleta"
      },{status:500})
    }

    const ctrl=new AbortController()
    const timeout=setTimeout(()=>ctrl.abort(),8000)

    const r=await fetch(
      `${SB_URL}/rest/v1/draws?date=eq.${date}&turno=eq.${encodeURIComponent(turno)}&select=numbers&limit=1`,
      {
        headers:{"apikey":SK_KEY,"Authorization":`Bearer ${SK_KEY}`},
        signal:ctrl.signal
      }
    )
    clearTimeout(timeout)

    if(!r.ok){
      throw new Error(`DB error: ${r.status}`)
    }

    const data=await r.json()

    if(!data?.[0]?.numbers?.length){
      return NextResponse.json({
        found:false,
        message:`Aún no hay resultado para ${turno} del ${date}`
      })
    }

    // Validar que los números sean válidos
    const numbers=Array.isArray(data[0].numbers)?data[0].numbers as unknown[]:[]
    const validNumbers=numbers.filter((n: unknown)=>!Number.isNaN(Number(n)))

    return NextResponse.json({
      found:true,
      numbers:validNumbers,
      date,
      turno,
      total:validNumbers.length
    })

  }catch(e:any){
    if(e?.name==="AbortError"){
      return NextResponse.json({
        found:false,
        error:"Timeout al consultar resultados"
      },{status:504})
    }
    return NextResponse.json({
      found:false,
      error:`Error: ${e?.message?.substring(0,80)||"desconocido"}`
    },{status:500})
  }
}
