import { NextRequest, NextResponse } from "next/server";
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sorteo = searchParams.get("sorteo") ?? "Todos";
  const U = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/"/g,"").trim();
  const K = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/"/g,"").trim();
  if (!U||!K) return NextResponse.json({error:"Variables no configuradas"},{status:500});
  const since = new Date(Date.now()-365*86400000).toISOString().split("T")[0];
  let url = `${U}/rest/v1/draws?select=date,turno,numbers&date=gte.${since}&order=date.desc&limit=2000`;
  if (sorteo !== "Todos") url += `&turno=eq.${encodeURIComponent(sorteo)}`;
  const c = new AbortController();
  setTimeout(()=>c.abort(),12000);
  try {
    const res = await fetch(url,{headers:{"apikey":K,"Authorization":"Bearer "+K},signal:c.signal});
    if (!res.ok) return NextResponse.json({error:"DB error: "+await res.text()},{status:500});
    const rows = await res.json();
    if (!rows?.length) return NextResponse.json({predictions:[],predictions3d:[],predictions4d:[],redoblona:[],frequencyData:[],totalDraws:0,sorteo});
    const freq=Array(100).fill(0),first=Array(100).fill(0),rdc:Record<number,number>={};
    for (const r of rows) {
      const ns:number[]=Array.isArray(r.numbers)?r.numbers:[];
      const seen=new Set<number>();
      ns.forEach((n,i)=>{const t=Number(n)%100;freq[t]++;if(i===0)first[t]++;if(seen.has(t))rdc[t]=(rdc[t]??0)+1;seen.add(t);});
    }
    const tot=freq.reduce((a,b)=>a+b,0)||1;
    const fd=freq.map((c,n)=>({num:n,total_appearances:c,first_place_count:first[n],frequency_ratio:c/tot}));
    const sc=fd.map(r=>({num:r.num,score:r.total_appearances+r.first_place_count*3})).sort((a,b)=>b.score-a.score);
    const t5=sc.slice(0,5),pad=(n:number,l=2)=>String(n).padStart(l,"0");
    const redoblona=Object.entries(rdc).map(([n,c])=>({num:pad(parseInt(n)),redoblonaCount:c,totalFreq:freq[parseInt(n)]})).sort((a,b)=>b.redoblonaCount-a.redoblonaCount).slice(0,5);
    return NextResponse.json({predictions:t5.map(x=>pad(x.num)),predictions3d:t5.map((x,i)=>pad(((i*3+1)%10)*100+x.num,3)),predictions4d:t5.map((x,i)=>pad(((i*7+13)%100)*100+x.num,4)),redoblona,frequencyData:fd,totalDraws:rows.length,sorteo,generatedAt:new Date().toISOString()});
  } catch(e:unknown) {
    return NextResponse.json({error:(e as Error)?.name==="AbortError"?"Timeout":(e as Error).message},{status:500});
  }
}
