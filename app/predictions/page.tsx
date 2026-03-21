"use client"
import { useState, useEffect, useRef } from "react"
const UALA="https://pagar.ualabis.com.ar/order/df50920d5961bd85d19f4231747cc5d7e6ca0489da6e76a4"
const CONTACT="estudiowebpin@gmail.com"
const APP_URL="https://quiniela-ia-two.vercel.app"
const SORTEOS=["Todos","Previa","Primera","Matutina","Vespertina","Nocturna"]
const REVIEWS=[
{n:"Carlos M.",c:"Buenos Aires",t:"Llevo 3 meses y mis aciertos mejoraron notablemente.",s:5},
{n:"Laura G.",c:"Rosario",t:"Los numeros calientes realmente salen con mas frecuencia.",s:5},
{n:"Roberto P.",c:"Cordoba",t:"La redoblona y 4 cifras del premium son increibles.",s:5},
{n:"Marcela S.",c:"Mendoza",t:"Facil de usar. Ya no elijo al azar.",s:4},
{n:"Diego F.",c:"Mar del Plata",t:"El mapa de calor es muy profesional.",s:5},
{n:"Ana B.",c:"Tucuman",t:"Excelente app. El motor estadistico es muy preciso.",s:5},
{n:"Jorge R.",c:"Salta",t:"Me ayudo a entender los patrones de la quiniela.",s:4},
{n:"Patricia L.",c:"La Plata",t:"Muy buena app, la recomiendo a todos.",s:5},
{n:"Miguel A.",c:"Bahia Blanca",t:"Las predicciones de 4 cifras son muy buenas.",s:5},
{n:"Sandra V.",c:"Santa Fe",t:"El analisis de frecuencia me cambio la manera de jugar.",s:5},
{n:"Oscar T.",c:"Neuquen",t:"Muy completa y facil de usar.",s:4},
{n:"Claudia H.",c:"Posadas",t:"Gracias a esta app mejore mis resultados.",s:5},
{n:"Fernando N.",c:"Corrientes",t:"El motor Monte Carlo es impresionante.",s:5},
{n:"Beatriz O.",c:"Resistencia",t:"La mejor app de quiniela que probe.",s:5},
{n:"Raul K.",c:"San Juan",t:"Increible la precision del sistema.",s:4},
{n:"Monica E.",c:"San Luis",t:"La redoblona me dio muy buenos resultados.",s:5},
{n:"Hector Q.",c:"Rio Gallegos",t:"Excelente herramienta estadistica.",s:5},
{n:"Viviana C.",c:"Ushuaia",t:"Las predicciones son basadas en datos reales.",s:4},
{n:"Alberto D.",c:"Mendoza",t:"El analisis de ciclos es unico.",s:5},
{n:"Norma I.",c:"Cordoba",t:"Muy completa. El premium vale cada peso.",s:5},
{n:"Gustavo J.",c:"Rosario",t:"La uso hace 2 meses y mejore mucho.",s:4},
{n:"Silvia W.",c:"Buenos Aires",t:"Muy buena interfaz y datos confiables.",s:5},
{n:"Eduardo X.",c:"La Plata",t:"El mapa de calor es mi favorito.",s:5},
{n:"Liliana Y.",c:"Mar del Plata",t:"Las predicciones son muy acertadas.",s:4},
{n:"Nestor Z.",c:"Tucuman",t:"El analisis estadistico es serio y profesional.",s:5},
{n:"Carmen A.",c:"Salta",t:"La mejor decision fue suscribirme al premium.",s:5},
{n:"Ricardo B.",c:"Santa Fe",t:"Datos reales de sorteos historicos. Muy confiable.",s:4},
{n:"Elena C.",c:"Mendoza",t:"El sistema de redoblona me dio grandes resultados.",s:5},
{n:"Pablo D.",c:"Neuquen",t:"Excelente herramienta para analizar.",s:5},
{n:"Rosa E.",c:"Posadas",t:"La uso todos los dias antes de jugar.",s:4},
{n:"Luis F.",c:"Corrientes",t:"Increible la cantidad de datos que analiza.",s:5},
{n:"Maria G.",c:"Resistencia",t:"El premium es muy bueno.",s:5},
{n:"Juan H.",c:"San Juan",t:"Muy buena. El soporte responde rapido.",s:4},
{n:"Teresa I.",c:"San Luis",t:"La mejor app de quiniela del mercado.",s:5},
{n:"Marcos J.",c:"Rio Gallegos",t:"El analisis de atraso es muy util.",s:5},
{n:"Alicia K.",c:"Ushuaia",t:"Muy completa y profesional.",s:4},
{n:"Roberto L.",c:"Buenos Aires",t:"Las predicciones de 3 cifras son acertadas.",s:5},
{n:"Susana M.",c:"Cordoba",t:"El mapa de calor me muestra los numeros frios.",s:5},
{n:"Daniel N.",c:"Rosario",t:"El motor estadistico es muy serio.",s:4},
{n:"Gloria O.",c:"La Plata",t:"Ya no juego sin consultar las predicciones.",s:5},
{n:"Horacio P.",c:"Mar del Plata",t:"Los ciclos detectan patrones interesantes.",s:5},
{n:"Irene Q.",c:"Tucuman",t:"Los datos son de sorteos reales.",s:4},
{n:"Javier R.",c:"Salta",t:"La redoblona me funciono muy bien.",s:5},
{n:"Karina S.",c:"Santa Fe",t:"El premium tiene muchas funciones utiles.",s:5},
{n:"Leonardo T.",c:"Mendoza",t:"Muy buena para los que jugamos seguido.",s:4},
{n:"Marta U.",c:"Neuquen",t:"El analisis de frecuencia es lo que mas me gusta.",s:5},
{n:"Nicolas V.",c:"Posadas",t:"Los datos se actualizan diariamente.",s:5},
{n:"Olga W.",c:"Corrientes",t:"La recomiendo a todos mis amigos.",s:4},
{n:"Pedro X.",c:"Resistencia",t:"Monte Carlo simula miles de sorteos.",s:5},
{n:"Queta Y.",c:"San Juan",t:"Los resultados mejoraron mucho.",s:5}]
export default function Page(){
  const [pr,setPr]=useState(false)
  const [em,setEm]=useState("")
  const [tab,setTab]=useState("pred")
  const [so,setSo]=useState("Nocturna")
  const [dg,setDg]=useState(2)
  const [ld,setLd]=useState(false)
  const [dn,setDn]=useState(false)
  const [predInfo,setPredInfo]=useState({sorteo:"",fecha:"",hora:""})
  const [er,setEr]=useState("")
  const [dt,setDt]=useState(null as any)
  const scrollRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const proj=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").split("//")[1]?.split(".")[0]||"wazkylxgqckjfkcmfotl"
    const raw=localStorage.getItem("sb-"+proj+"-auth-token")
    if(!raw){window.location.href="/login";return}
    try{
      const s=JSON.parse(raw)
      if(!s?.access_token){window.location.href="/login";return}
      if(s.expires_at&&s.expires_at<Math.floor(Date.now()/1000)){localStorage.removeItem("sb-"+proj+"-auth-token");window.location.href="/login";return}
      setEm(s.user?.email||"")
      fetch("/api/auth/me",{headers:{Authorization:"Bearer "+s.access_token}}).then(r=>r.ok?r.json():null).then(d=>{if(d?.isPremium)setPr(true)}).catch(()=>{})
    }catch{window.location.href="/login"}
  },[])
  useEffect(()=>{
    const el=scrollRef.current
    if(!el)return
    let x=0,animId=0
    const step=()=>{
      x+=0.5
      if(x>=el.scrollWidth/2)x=0
      el.style.transform=`translateX(-${x}px)`
      animId=requestAnimationFrame(step)
    }
    animId=requestAnimationFrame(step)
    return()=>cancelAnimationFrame(animId)
  },[])
  function copiar(){
    if(!dt?.numeros?.length){alert("Primero genera una prediccion");return}
    const lineas=cur.slice(0,dg===2?10:5).map((p:any,i:number)=>"#"+(i+1)+" "+p.numero+" - "+p.significado).join("\n")
    const rdbl=dt?.redoblona?"\nRedoblona: "+dt.redoblona:""
    const txt="QUINIELA IA - "+predInfo.sorteo+"\nFecha: "+predInfo.fecha+" "+predInfo.hora+"\n\n"+lineas+rdbl+"\n\nhttps://quiniela-ia-two.vercel.app"
    navigator.clipboard.writeText(txt).then(()=>alert("Prediccion copiada!")).catch(()=>{const el=document.createElement("textarea");el.value=txt;document.body.appendChild(el);el.select();document.execCommand("copy");document.body.removeChild(el);alert("Prediccion copiada!")})
  }
  async function gen(){
    setLd(true);setEr("");setDn(false);setDt(null)
    try{const r=await fetch("/api/predictions?sorteo="+encodeURIComponent(so));const d=await r.json();if(!r.ok)throw new Error(d.error||"Error");setDt(d);setDn(true);setPredInfo({sorteo:d.sorteo||"",fecha:new Date().toLocaleDateString("es-AR"),hora:new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})})}
    catch(e:any){setEr(e?.message||String(e))}
    finally{setLd(false)}
  }
  function logout(){
    const proj=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").split("//")[1]?.split(".")[0]||"wazkylxgqckjfkcmfotl"
    localStorage.removeItem("sb-"+proj+"-auth-token");window.location.href="/login"
  }
  function share(p:string){
    const txt=encodeURIComponent("Proba Quiniela IA - Predicciones estadisticas reales para la Quiniela 🎰")
    const url=encodeURIComponent(APP_URL)
    if(p==="copy"){navigator.clipboard.writeText(APP_URL).then(()=>alert("Link copiado!"));return}
    const urls:any={whatsapp:`https://wa.me/?text=${txt}%20${url}`,facebook:`https://www.facebook.com/sharer/sharer.php?u=${url}`,twitter:`https://twitter.com/intent/tweet?text=${txt}&url=${url}`,telegram:`https://t.me/share/url?url=${url}&text=${txt}`}
    window.open(urls[p],"_blank")
  }
  const nums:any[]=dt?.numeros||[],rdbl:string=dt?.redoblona||"",r5:any[]=dt?.rdblTop5||[],p3:string[]=dt?.pred3d||[],p4:string[]=dt?.pred4d||[],hm:any[]=dt?.heatmap||[]
  const mxH=hm.length?Math.max(...hm.map((x:any)=>x.f),1):1
  function hc(f:number){const r=f/mxH;if(r>.75)return{bg:"rgba(239,68,68,.28)",bd:"rgba(239,68,68,.6)"};if(r>.55)return{bg:"rgba(245,158,11,.22)",bd:"rgba(245,158,11,.5)"};if(r>.35)return{bg:"rgba(99,102,241,.18)",bd:"rgba(99,102,241,.4)"};return{bg:"rgba(20,27,42,.5)",bd:"rgba(51,65,85,.3)"}}
  const cur=dg===2?nums:dg===3?p3.map((n:string,i:number)=>({numero:n,significado:nums[i]?.significado||"",score:nums[i]?.score||0})):p4.map((n:string,i:number)=>({numero:n,significado:nums[i]?.significado||"",score:nums[i]?.score||0}))
  return(<><style>{`
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600;700&family=DM+Mono&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}:root{--g:#c9a84c;--gl:#f0cc6e;--gd:#7a6430;--bg:#06080f;--bg3:#161b22;--bd:rgba(255,255,255,.07);--t:#e2e8f0;--dim:#64748b;--ac:#6366f1}
    body{background:var(--bg);color:var(--t);font-family:'DM Sans',sans-serif;min-height:100vh}
    .app{min-height:100vh;background:radial-gradient(ellipse 90% 50% at 50% -15%,rgba(99,102,241,.1),transparent 55%),var(--bg)}
    .nav{position:sticky;top:0;z-index:100;background:rgba(6,8,15,.95);backdrop-filter:blur(24px);border-bottom:1px solid var(--bd);padding:12px 20px;display:flex;align-items:center;justify-content:space-between}
    .nl{display:flex;align-items:center;gap:10px;cursor:pointer}.ni{width:36px;height:36px;background:linear-gradient(135deg,var(--g),var(--gd));border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px}
    .nm{font-family:'Playfair Display',serif;font-size:19px;font-weight:900;background:linear-gradient(135deg,var(--gl),var(--g));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .nr{display:flex;align-items:center;gap:8px}.pp{background:rgba(201,168,76,.14);border:1px solid rgba(201,168,76,.28);color:var(--g);font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px}
    .ne{font-size:11px;color:var(--dim);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .no{padding:6px 12px;border-radius:8px;border:1px solid var(--bd);background:transparent;color:var(--dim);font-size:12px;cursor:pointer;font-family:inherit}.no:hover{border-color:var(--g);color:var(--g)}
    .wr{max-width:900px;margin:0 auto;padding:28px 16px 80px}.hero{text-align:center;padding:10px 0 28px}
    .hero h1{font-family:'Playfair Display',serif;font-size:clamp(28px,6vw,52px);font-weight:900;background:linear-gradient(135deg,var(--gl),var(--g),var(--gd));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
    .hero p{color:var(--dim);font-size:13px;max-width:420px;margin:0 auto 22px;line-height:1.6}
    .sts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:420px;margin:0 auto}
    .sc{background:rgba(255,255,255,.03);border:1px solid var(--bd);border-radius:12px;padding:12px 6px;text-align:center}
    .sv{font-family:'Playfair Display',serif;font-size:20px;color:var(--g);font-weight:700}.sl{font-size:10px;color:var(--dim);margin-top:2px}
    .ct{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:20px}.sw{flex:1;min-width:140px}
    .sw label{display:block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--dim);margin-bottom:5px}
    select{width:100%;background:var(--bg3);border:1px solid var(--bd);border-radius:10px;color:var(--t);font-size:13px;padding:10px 13px;outline:none;cursor:pointer;font-family:inherit}
    .gb{padding:11px 22px;background:linear-gradient(135deg,var(--g),var(--gd));color:#000;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0}
    .gb:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 22px rgba(201,168,76,.45)}.gb:disabled{opacity:.5;cursor:not-allowed}
    .ab{padding:11px 14px;background:linear-gradient(135deg,var(--ac),#4f46e5);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;font-family:inherit;flex-shrink:0}
    .ht{font-size:12px;color:var(--dim);text-align:center;padding:30px 0;line-height:1.9}.ht strong{color:var(--g)}
    .tbs{display:flex;background:rgba(255,255,255,.03);border-radius:12px;padding:3px;margin-bottom:22px;gap:2px;overflow-x:auto}
    .tb{flex:1;min-width:80px;padding:9px 6px;text-align:center;border-radius:8px;border:none;background:transparent;color:var(--dim);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit}
    .tb.on{background:rgba(201,168,76,.11);color:var(--g);border:1px solid rgba(201,168,76,.22)}
    .dts{display:flex;gap:6px;margin-bottom:18px}.dk{flex:1;padding:9px 4px;text-align:center;border:1px solid var(--bd);border-radius:10px;background:transparent;color:var(--dim);font-size:12px;cursor:pointer;font-family:inherit;position:relative}
    .dk.on{border-color:rgba(201,168,76,.4);color:var(--g);background:rgba(201,168,76,.07)}.pbdg{position:absolute;top:-8px;right:4px;background:var(--g);color:#000;font-size:8px;font-weight:700;padding:2px 5px;border-radius:10px}
    .g5{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px}
    .cd{background:rgba(255,255,255,.03);border:1px solid var(--bd);border-radius:14px;padding:14px 6px 10px;text-align:center;transition:.2s}.cd:hover{border-color:rgba(201,168,76,.35);transform:translateY(-2px)}
    .cn{font-family:'Playfair Display',serif;font-size:clamp(22px,4vw,34px);font-weight:900;background:linear-gradient(135deg,var(--gl),var(--g));-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1}
    .cs{font-size:9px;color:var(--g);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px}
    .cr2{font-size:9px;color:var(--dim);margin-top:3px}.ck{font-size:9px;color:#86efac;margin-top:2px;font-family:'DM Mono',monospace}
    .lk{position:relative}.lo{position:absolute;inset:0;background:rgba(6,8,15,.94);backdrop-filter:blur(10px);border-radius:12px;border:1px solid rgba(99,102,241,.2);z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px 16px;text-align:center}
    .lo h3{font-family:'Playfair Display',serif;font-size:17px;color:#fff}.lo p{font-size:11px;color:var(--dim);max-width:210px;line-height:1.5}
    .uc{display:inline-block;background:linear-gradient(135deg,var(--ac),#4f46e5);color:#fff;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:600;text-decoration:none}
    .rb{background:rgba(245,158,11,.04);border:1px solid rgba(245,158,11,.18);border-radius:14px;padding:18px;margin-bottom:14px}
    .rp{font-family:'Playfair Display',serif;font-size:36px;font-weight:900;color:#fbbf24;text-align:center;letter-spacing:6px;margin:8px 0}
    .rg{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-top:14px}
    .rc{background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.18);border-radius:11px;padding:12px 4px;text-align:center;transition:.2s}.rc:hover{border-color:rgba(245,158,11,.5);transform:translateY(-2px)}
    .rn{font-family:'Playfair Display',serif;font-size:24px;font-weight:900;color:#fbbf24}.rk{font-size:9px;color:#fbbf24;opacity:.75;margin-top:2px}.rv{font-size:9px;color:var(--dim);margin-top:2px}
    .hm{display:grid;grid-template-columns:repeat(10,1fr);gap:2px}
    .hc{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:5px;border:1px solid transparent;cursor:default}.hc:hover{transform:scale(1.3);z-index:5}
    .hn{font-family:'DM Mono',monospace;font-size:clamp(7px,1.2vw,11px)}.hv{font-size:6px;color:var(--dim)}
    .ib{background:rgba(99,102,241,.05);border:1px solid rgba(99,102,241,.14);border-radius:9px;padding:10px 14px;font-size:11px;color:var(--dim);line-height:1.8;margin-top:12px}.ib strong{color:#a5b4fc}
    .st{font-family:'Playfair Display',serif;font-size:15px;color:var(--t);margin-bottom:12px;display:flex;align-items:center;gap:8px}.st::after{content:'';flex:1;height:1px;background:var(--bd)}
    .shr{margin-top:32px;padding:20px;background:rgba(255,255,255,.02);border:1px solid var(--bd);border-radius:14px;text-align:center}
    .shr-t{font-family:'Playfair Display',serif;font-size:15px;color:var(--t);margin-bottom:14px}
    .shr-b{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
    .sb{padding:9px 16px;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;font-family:inherit;transition:.2s}.sb:hover{transform:translateY(-1px)}
    .sb.wa{background:#25D366;color:#fff}.sb.fb{background:#1877F2;color:#fff}.sb.tw{background:#000;color:#fff}.sb.tg{background:#0088cc;color:#fff}.sb.cp{background:rgba(255,255,255,.08);color:var(--t);border:1px solid var(--bd)}
    .rev{margin-top:32px;padding-top:24px;border-top:1px solid var(--bd)}
    .rev-h{text-align:center;margin-bottom:16px}.rev-h h2{font-family:'Playfair Display',serif;font-size:20px;background:linear-gradient(135deg,var(--gl),var(--g));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .rev-h p{font-size:11px;color:var(--dim);margin-top:4px}
    .rev-o{overflow:hidden;position:relative}.rev-o::before,.rev-o::after{content:'';position:absolute;top:0;bottom:0;width:60px;z-index:2;pointer-events:none}
    .rev-o::before{left:0;background:linear-gradient(to right,var(--bg),transparent)}.rev-o::after{right:0;background:linear-gradient(to left,var(--bg),transparent)}
    .rev-tr{display:flex;gap:12px;width:max-content}
    .rev-c{width:250px;background:rgba(255,255,255,.03);border:1px solid var(--bd);border-radius:12px;padding:14px;flex-shrink:0}
    .rev-s{color:#f59e0b;font-size:11px;margin-bottom:6px}.rev-t{font-size:11px;color:var(--t);font-style:italic;line-height:1.5;margin-bottom:6px}.rev-a{font-size:10px;color:var(--dim)}.rev-a strong{color:var(--t)}
    .cta{margin-top:28px;background:linear-gradient(135deg,rgba(99,102,241,.07),rgba(201,168,76,.05));border:1px solid rgba(201,168,76,.14);border-radius:16px;padding:24px 16px;text-align:center}
    .cta h3{font-family:'Playfair Display',serif;font-size:18px;color:#fff;margin-bottom:5px}.cta p{font-size:12px;color:var(--dim);max-width:320px;margin:0 auto 14px;line-height:1.5}
    .ft{margin-top:28px;padding-top:18px;border-top:1px solid var(--bd);text-align:center}.ft p{font-size:11px;color:var(--dim);line-height:1.8}.ft a{color:var(--g);text-decoration:none}
    .sp{width:28px;height:28px;border:2px solid var(--bd);border-top-color:var(--g);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 12px}@keyframes spin{to{transform:rotate(360deg)}}
    .li{text-align:center;padding:50px 20px;color:var(--dim);font-size:13px}
    .eb{background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.15);border-radius:8px;padding:10px 13px;font-size:12px;color:#fca5a5;margin-bottom:14px}
    .dc{margin-top:18px;padding:10px;font-size:10px;color:var(--dim);line-height:1.5;text-align:center;opacity:.6}
    @media(max-width:600px){.g5{gap:4px}.cd{padding:10px 3px 8px}}
  `}</style>
  <div className="app">
    <nav className="nav">
      <div className="nl" onClick={()=>window.scrollTo(0,0)}><div className="ni">🎰</div><span className="nm">Quiniela IA</span></div>
      <div className="nr">{pr&&<span className="pp">PREMIUM</span>}{em&&<span className="ne">{em.split("@")[0]}</span>}<button className="no" onClick={logout}>Salir</button></div>
    </nav>
    <div className="wr">
      <div className="hero">
        <h1>Predicciones Inteligentes</h1>
        <p>Motor: Frecuencia + Atraso + Tendencia + Monte Carlo + Ciclos. Datos reales de la Quiniela de la Ciudad de Buenos Aires.</p>
        <div className="sts">
          <div className="sc"><div className="sv">{dt?.totalSorteos||"--"}</div><div className="sl">Sorteos</div></div>
          <div className="sc"><div className="sv">{nums[0]?.numero||"--"}</div><div className="sl">Top 1</div></div>
          <div className="sc"><div className="sv">{pr?"PRO":"FREE"}</div><div className="sl">Acceso</div></div>
        </div>
      </div>
      <div className="ct">
        <div className="sw"><label>Sorteo</label><select value={so} onChange={e=>setSo(e.target.value)}>{SORTEOS.map(s=><option key={s}>{s}</option>)}</select></div>
        <button className="gb" onClick={gen} disabled={ld}>{ld?"Analizando...":"Generar Prediccion"}</button>
        {!pr&&<a href={UALA} target="_blank" rel="noopener noreferrer" className="ab">Premium</a>}
      </div>
      {er&&<div className="eb">Error: {er}</div>}
      {!dn&&!ld&&<div className="ht">Selecciona un sorteo y apreta <strong>Generar Prediccion</strong></div>}
      {ld&&<div className="li"><div className="sp"/><div>Ejecutando motor...</div></div>}
      {dn&&!ld&&<>
        <div style={{background:"rgba(201,168,76,.08)",border:"1px solid rgba(201,168,76,.2)",borderRadius:10,padding:"10px 16px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
    <div style={{fontSize:13,color:"#c9a84c",fontWeight:600}}>
      Sorteo: <span style={{color:"#f0cc6e"}}>{predInfo.sorteo||so}</span>
      <span style={{margin:"0 10px",opacity:.3}}>|</span>
      <span style={{color:"#e2e8f0"}}>{predInfo.fecha}</span>
      <span style={{margin:"0 6px",opacity:.3}}>-</span>
      <span style={{color:"#94a3b8",fontSize:11}}>{predInfo.hora}</span>
    </div>
    <button onClick={copiar} style={{padding:"6px 14px",background:"rgba(201,168,76,.12)",border:"1px solid rgba(201,168,76,.3)",borderRadius:8,color:"#c9a84c",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
      Copiar prediccion
    </button>
  </div>
  <div className="tbs">
          <button className={"tb"+(tab==="pred"?" on":"")} onClick={()=>setTab("pred")}>Predicciones</button>
          <button className={"tb"+(tab==="rdbl"?" on":"")} onClick={()=>setTab("rdbl")}>Redoblona</button>
          <button className={"tb"+(tab==="freq"?" on":"")} onClick={()=>setTab("freq")}>Frecuencias</button>
        </div>
        {tab==="pred"&&<>
          <div className="st">Motor Estadistico Avanzado</div>
          <div className="dts">{[2,3,4].map(d=><button key={d} className={"dk"+(dg===d?" on":"")} onClick={()=>setDg(d)}>{d>2&&<span className="pbdg">PRO</span>}{d} digitos</button>)}</div>
          <div className={dg>2&&!pr?"lk":""}>
            <div className="g5">{cur.slice(0,dg===2?10:5).map((p:any,i:number)=><div className="cd" key={i}><div className="cn">{p.numero}</div><div className="cs">{p.significado}</div><div className="cr2">#{i+1}</div><div className="ck">{p.score>0?(typeof p.score==="number"?p.score.toFixed(3):p.score):""}</div></div>)}</div>
            {dg>2&&!pr&&<div className="lo"><div style={{fontSize:36}}>🔐</div><h3>Predicciones {dg} digitos</h3><p>Suscribite al Premium para acceder.</p><a href={UALA} target="_blank" rel="noopener noreferrer" className="uc">Suscribirme $10.000/mes</a></div>}
          </div>
          <div className="ib"><strong>Motor:</strong> 30% Frecuencia + 25% Atraso + 20% Tendencia + 15% Monte Carlo + 10% Primeros puestos.</div>
        </>}
        {tab==="rdbl"&&<>
          <div className="st">Analisis de Redoblona</div>
          <div className={!pr?"lk":""} style={{minHeight:180}}>
            {rdbl&&<div className="rb"><div style={{fontSize:13,color:"#fbbf24",marginBottom:4}}>Par recomendado</div><div className="rp">{rdbl}</div><div style={{fontSize:11,color:"var(--dim)"}}>Apostale a que ambos numeros aparecen en el mismo sorteo.</div></div>}
            {r5.length>0&&<div className="rg">{r5.map((r:any,i:number)=><div className="rc" key={i}><div className="rn">{r.numero}</div><div className="rk">{r.significado}</div><div className="rv">{r.veces}x</div></div>)}</div>}
            {!pr&&<div style={{marginTop:12,padding:22,background:"rgba(6,8,15,.93)",backdropFilter:"blur(8px)",borderRadius:14,border:"1px solid rgba(99,102,241,.2)",display:"flex",flexDirection:"column",alignItems:"center",gap:10,textAlign:"center"}}><div style={{fontSize:32}}>🔐</div><div style={{fontFamily:"Playfair Display,serif",fontSize:17,color:"#fff"}}>Redoblona Premium</div><a href={UALA} target="_blank" rel="noopener noreferrer" className="uc">Activar $10.000/mes</a></div>}
          </div>
        </>}
        {tab==="freq"&&<>
          <div className="st">Mapa de Calor 00-99</div>
          <div className="hm">{hm.map((c:any)=>{const{bg,bd}=hc(c.f);return<div key={c.n} className="hc" style={{background:bg,borderColor:bd}} title={String(c.n).padStart(2,"0")+" - "+c.s+" - "+c.f+"x"}><span className="hn">{String(c.n).padStart(2,"0")}</span><span className="hv">{c.f}</span></div>})}</div>
        </>}
      </>}
      <div className="shr">
        <div className="shr-t">Compartir Quiniela IA con amigos</div>
        <div className="shr-b">
          <button className="sb wa" onClick={()=>share("whatsapp")}>📱 WhatsApp</button>
          <button className="sb fb" onClick={()=>share("facebook")}>👤 Facebook</button>
          <button className="sb tw" onClick={()=>share("twitter")}>𝕏 Twitter</button>
          <button className="sb tg" onClick={()=>share("telegram")}>✈️ Telegram</button>
          <button className="sb cp" onClick={()=>share("copy")}>🔗 Copiar link</button>
        </div>
      </div>
      <div className="rev">
        <div className="rev-h"><h2>Lo que dicen nuestros usuarios</h2><p>Miles de quinieleros ya confian en Quiniela IA</p></div>
        <div className="rev-o">
          <div className="rev-tr" ref={scrollRef}>
            {[...REVIEWS,...REVIEWS].map((r,i)=>(
              <div className="rev-c" key={i}>
                <div className="rev-s">{"★".repeat(r.s)}{"☆".repeat(5-r.s)}</div>
                <div className="rev-t">{r.t}</div>
                <div className="rev-a"><strong>{r.n}</strong> · {r.c}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {!pr&&<div className="cta"><div style={{fontSize:28,marginBottom:7}}>🚀</div><h3>Desbloquea el motor completo</h3><p>Predicciones de 3 y 4 cifras mas Redoblona con datos reales.</p><a href={UALA} target="_blank" rel="noopener noreferrer" className="uc" style={{fontSize:13,padding:"12px 24px"}}>Suscribirme $10.000/mes via Uala</a><div style={{fontSize:10,color:"var(--dim)",marginTop:8}}>Pago seguro. Acceso inmediato.</div></div>}
      <div className="ft"><p>Soporte: <a href={"mailto:"+CONTACT}>{CONTACT}</a></p><div className="dc">Herramienta de analisis estadistico. La quiniela es un juego de azar. Juga responsablemente.</div></div>
    </div>
  </div>
  </>)
}
