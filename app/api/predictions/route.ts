import { NextRequest, NextResponse } from "next/server";
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sorteo = searchParams.get("sorteo") ?? "Todos";
  const U = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/"/g,"").trim();
  const K = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/"/g,"").trim();
  if (!U||!K) return NextResponse.json({error:"Variables no configuradas"},{status:500});
  const since = new Date(Date.now()-365*86400000).toISOString().split("T")[0];
  let url = `${U}/rest/v1/draws?select=date,turno,numbers&date=gte.${since}&order=date.desc&limit=2000`;
  if (sorteo!=="Todos") url+=`&turno=eq.${encodeURIComponent(sorteo)}`;
  const c=new AbortController(); setTimeout(()=>c.abort(),12000);
  try {
    const res=await fetch(url,{headers:{"apikey":K,"Authorization":"Bearer "+K},signal:c.signal});
    if (!res.ok) return NextResponse.json({error:"DB error: "+await res.text()},{status:500});
    const rows=await res.json();
    if (!rows?.length) return NextResponse.json({top10:[],predictions:[],predictions3d:[],predictions4d:[],redoblona_pair:[],frequencyData:[],totalDraws:0,sorteo});
    const freq=Array(100).fill(0),first=Array(100).fill(0),rdc:Record<number,number>={};
    for (const r of rows){
      const ns:number[]=Array.isArray(r.numbers)?r.numbers:[];
      const seen=new Set<number>();
      ns.forEach((n:number,i:number)=>{const t=Number(n)%100;freq[t]++;if(i===0)first[t]++;if(seen.has(t))rdc[t]=(rdc[t]??0)+1;seen.add(t);});
    }
    const tot=freq.reduce((a:number,b:number)=>a+b,0)||1;
    const fd=freq.map((c:number,n:number)=>({num:n,total_appearances:c,first_place_count:first[n],frequency_ratio:c/tot}));
    const scored=fd.map((r:{num:number;total_appearances:number;first_place_count:number})=>({num:r.num,score:r.total_appearances+r.first_place_count*3})).sort((a:{score:number},b:{score:number})=>b.score-a.score);
    const t10=scored.slice(0,10),pad=(n:number,l=2)=>String(n).padStart(l,"0");
    const KINO:Record<number,string>={0:"Huevos",1:"Agua",2:"Nino",3:"San Cono",4:"Cama",5:"Gato",6:"Perro",7:"Revolver",8:"Incendio",9:"Arroyo",10:"Canon",11:"Minero",12:"Soldado",13:"Yeta",14:"Borracho",15:"Nina bonita",16:"Anillo",17:"Desgracia",18:"Sangre",19:"Pescado",20:"Fiesta",21:"Mujer",22:"Loco",23:"Cocinero",24:"Caballo",25:"Gallina",26:"Misa",27:"Peine",28:"Cerro",29:"San Pedro",30:"Santa Rosa",31:"Luz",32:"Dinero",33:"Cristo",34:"Cabeza",35:"Pajarito",36:"Manteca",37:"Dentista",38:"Piedras",39:"Lluvia",40:"Cura",41:"Cuchillo",42:"Zapatillas",43:"Balcon",44:"Carcel",45:"Vino",46:"Tomates",47:"Muerto",48:"Muerto habla",49:"Carne",50:"Pan",51:"Serrucho",52:"Madre",53:"Barco",54:"Vaca",55:"Musica",56:"Caida",57:"Jorobado",58:"Ahogado",59:"Planta",60:"Virgen",61:"Escopeta",62:"Inundacion",63:"Casamiento",64:"Llanto",65:"Cazador",66:"Lombriz",67:"Vibora",68:"Sobrinos",69:"Vicios",70:"Muerto sueno",71:"Excremento",72:"Sorpresa",73:"Hospital",74:"Gente negra",75:"Payaso",76:"Fuego",77:"Pierna mujer",78:"Ramera",79:"Ladron",80:"Bocha",81:"Flores",82:"Pelea",83:"Mal tiempo",84:"Iglesia",85:"Linterna",86:"Humo",87:"Piojos",88:"Papa",89:"Rata",90:"Miedo",91:"Excusado",92:"Medico",93:"Enamorado",94:"Cementerio",95:"Anteojos",96:"Marido",97:"Mesa",98:"Lavandera",99:"Hermano"};
    const top10=t10.map((x:{num:number;score:number})=>({numero:pad(x.num),significado:KINO[x.num]??"",score:Math.round(x.score*100)/100}));
    const t5=t10.slice(0,5);
    const redoblona_pair=Object.entries(rdc).map(([n,c])=>({num:pad(parseInt(n)),significado:KINO[parseInt(n)]??"",redoblonaCount:c,totalFreq:freq[parseInt(n)]})).sort((a,b)=>b.redoblonaCount-a.redoblonaCount).slice(0,5);
    return NextResponse.json({top10,predictions:t5.map((x:{num:number})=>pad(x.num)),predictions3d:t5.map((x:{num:number},i:number)=>pad(((i*3+1)%10)*100+x.num,3)),predictions4d:t5.map((x:{num:number},i:number)=>pad(((i*7+13)%100)*100+x.num,4)),redoblona:top10[0]?.numero+"-"+top10[1]?.numero,redoblona_pair,frequencyData:fd,totalDraws:rows.length,sorteo,generatedAt:new Date().toISOString()});
  } catch(e:unknown){return NextResponse.json({error:(e as Error)?.name==="AbortError"?"Timeout":(e as Error).message},{status:500});}
}
