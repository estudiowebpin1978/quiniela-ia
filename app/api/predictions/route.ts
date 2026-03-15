import { NextRequest, NextResponse } from "next/server"
const SUENOS: {[k:number]:string} = {0:"Huevos",1:"Agua",2:"Nino",3:"San Cono",4:"La cama",5:"Gato",6:"Perro",7:"Revolver",8:"Incendio",9:"Arroyo",10:"La leche",11:"Minero",12:"Soldado",13:"La yeta",14:"Borracho",15:"Nina bonita",16:"Anillo",17:"Desgracia",18:"Sangre",19:"Pescado",20:"La fiesta",21:"Mujer",22:"Loco",23:"Cocinero",24:"Caballo",25:"Gallina",26:"La misa",27:"Peine",28:"Cerro",29:"San Pedro",30:"Santa Rosa",31:"Luz",32:"Dinero",33:"Cristo",34:"Cabeza",35:"Pajarito",36:"Manteca",37:"Dentista",38:"Piedras",39:"Lluvia",40:"Cura",41:"Cuchillo",42:"Zapatillas",43:"Balcon",44:"Carcel",45:"Vino",46:"Tomates",47:"Muerto",48:"Muerto habla",49:"Carne",50:"Pan",51:"Serrucho",52:"Madre",53:"Barco",54:"Vaca",55:"Musica",56:"Caida",57:"Jorobado",58:"Ahogado",59:"Plantas",60:"Virgen",61:"Escopeta",62:"Inundacion",63:"Casamiento",64:"Llanto",65:"Cazador",66:"Lombrices",67:"Vibora",68:"Sobrinos",69:"Vicios",70:"Muerto sueno",71:"Excremento",72:"Sorpresa",73:"Hospital",74:"Gente negra",75:"Besos",76:"Fuego",77:"Pierna mujer",78:"Ramera",79:"Ladron",80:"Bochas",81:"Flores",82:"Pelea",83:"Mal tiempo",84:"Iglesia",85:"Linterna",86:"Humo",87:"Piojos",88:"Papas",89:"Rata",90:"Miedo",91:"Excursion",92:"Medico",93:"Enamorado",94:"Cementerio",95:"Anteojos",96:"Marido",97:"Mesa",98:"Lavandera",99:"Hermano"}
function pad(n:number,l=2){return String(n).padStart(l,"0")}
function monteCarlo(freq:number[]):number[]{
  const mc=new Array(100).fill(0)
  const w=freq.map(f=>f+1),tot=w.reduce((a,b)=>a+b,0)
  const cum:number[]=[]; let acc=0
  for(const x of w){acc+=x/tot;cum.push(acc)}
  for(let s=0;s<20000;s++){
    const r=Math.random(); let lo=0,hi=99
    while(lo<hi){const m=(lo+hi)>>1;if(cum[m]<r)lo=m+1;else hi=m}
    mc[lo]++
  }
  return mc
}
export async function GET(req:NextRequest){
  const {searchParams}=new URL(req.url)
  const sorteo=searchParams.get("sorteo")||"Todos"
  const SB=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/"/g,"").trim()
  const SK=(process.env.SUPABASE_SERVICE_ROLE_KEY||"").replace(/"/g,"").trim()
  if(!SB||!SK) return NextResponse.json({error:"Variables no configuradas"},{status:500})
  const since=new Date(Date.now()-365*86400000).toISOString().split("T")[0]
  let url=`${SB}/rest/v1/draws?select=date,turno,numbers&date=gte.${since}&order=date.desc&limit=2000`
  if(sorteo!=="Todos") url+=`&turno=eq.${encodeURIComponent(sorteo)}`
  const ctrl=new AbortController(); setTimeout(()=>ctrl.abort(),12000)
  try{
    const res=await fetch(url,{headers:{"apikey":SK,"Authorization":`Bearer ${SK}`},signal:ctrl.signal})
    if(!res.ok) return NextResponse.json({error:`DB error: ${await res.text()}`},{status:500})
    const rows:any[]=await res.json()
    if(!rows?.length) return NextResponse.json({numeros:[],redoblona:"",rdblTop5:[],pred3d:[],pred4d:[],heatmap:[],totalSorteos:0,sorteo})
    const hist:number[]=[],fp:number[]=[],freq=new Array(100).fill(0),ff=new Array(100).fill(0)
    for(const row of rows){
      const nums=Array.isArray(row.numbers)?row.numbers:[]
      nums.forEach((n:any,i:number)=>{const t=Number(n)%100;hist.push(t);freq[t]++;if(i===0){fp.push(t);ff[t]++}})
    }
    const delay=new Array(100).fill(hist.length)
    for(let i=hist.length-1;i>=0;i--){if(delay[hist[i]]===hist.length)delay[hist[i]]=hist.length-1-i}
    const trend=new Array(100).fill(0)
    for(const n of hist.slice(-200)) trend[n]++
    const mc=monteCarlo(freq)
    const mxF=Math.max(...freq,1),mxD=Math.max(...delay,1),mxT=Math.max(...trend,1),mxM=Math.max(...mc,1),mxFF=Math.max(...ff,1)
    const scores=Array.from({length:100},(_,i)=>({n:i,score:0.30*(freq[i]/mxF)+0.25*(delay[i]/mxD)+0.20*(trend[i]/mxT)+0.15*(mc[i]/mxM)+0.10*(ff[i]/mxFF)}))
    scores.sort((a,b)=>b.score-a.score)
    const rdblCount:Record<number,number>={}
    for(const row of rows){
      const nums=Array.isArray(row.numbers)?row.numbers:[]; const seen=new Set<number>()
      for(const n of nums){const t=Number(n)%100;if(seen.has(t))rdblCount[t]=(rdblCount[t]||0)+1;seen.add(t)}
    }
    const top10=scores.slice(0,10).map((x,i)=>({numero:pad(x.n),significado:SUENOS[x.n]||"",score:Math.round(x.score*10000)/10000,rank:i+1,frecuencia:freq[x.n],primera:ff[x.n]}))
    const rdblTop5=Object.entries(rdblCount).map(([n,c])=>({numero:pad(Number(n)),significado:SUENOS[Number(n)]||"",veces:c})).sort((a,b)=>b.veces-a.veces).slice(0,5)
    const pred3d=top10.slice(0,5).map((x,i)=>pad(((i*3+1)%10)*100+Number(x.numero),3))
    const pred4d=top10.slice(0,5).map((x,i)=>pad(((i*7+13)%100)*100+Number(x.numero),4))
    const heatmap=freq.map((f,n)=>({n,f,s:SUENOS[n]||""}))
    return NextResponse.json({numeros:top10,redoblona:`${top10[0].numero}-${top10[1].numero}`,rdblTop5,pred3d,pred4d,heatmap,totalSorteos:rows.length,sorteo,generado:new Date().toISOString()})
  }catch(e:any){
    return NextResponse.json({error:e?.name==="AbortError"?"Timeout":String(e?.message)},{status:500})
  }
}
