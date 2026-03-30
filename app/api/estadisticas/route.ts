import { NextResponse } from "next/server"
const SB=()=>(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/"/g,"").trim()
const SK=()=>(process.env.SUPABASE_SERVICE_ROLE_KEY||"").replace(/"/g,"").trim()
export async function GET(){
  try{
    const r=await fetch(`${SB()}/rest/v1/draws?select=date,turno,numbers&order=date.desc&limit=150`,{headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`}})
    const rows=await r.json()
    if(!rows?.length)return NextResponse.json({aciertos:0,total:0,pct:0,racha:0,totalSorteos:0,mensaje:""})
    const freq=new Array(100).fill(0)
    for(const row of rows){const nums=(row.numbers||[]).map((n:any)=>Number(n)%100);for(const n of nums)freq[n]++}
    const top10=freq.map((f,i)=>({n:i,f})).sort((a,b)=>b.f-a.f).slice(0,10).map(x=>x.n)
    const ultimos30=rows.slice(0,30)
    let aciertos=0,racha=0,rachaCont=true
    for(const row of ultimos30){
      const nums=(row.numbers||[]).map((n:any)=>Number(n)%100)
      const ok=nums.some((n:number)=>top10.includes(n))
      if(ok){aciertos++;if(rachaCont)racha++}else{rachaCont=false}
    }
    const pct=Math.round(aciertos/ultimos30.length*100)
    return NextResponse.json({aciertos,total:ultimos30.length,pct,racha,totalSorteos:rows.length,since:rows[rows.length-1]?.date||"",mensaje:pct>=70?"Motor con "+pct+"% de aciertos en los ultimos 30 sorteos":"Analisis basado en "+rows.length+" sorteos reales"})
  }catch{return NextResponse.json({aciertos:0,total:0,pct:0,racha:0,totalSorteos:0,mensaje:""})}
}
