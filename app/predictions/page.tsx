"use client";
import { useState, useEffect, useCallback, useRef } from "react";

const UALA = "https://pagar.ualabis.com.ar/order/df50920d5961bd85d19f4231747cc5d7e6ca0489da6e76a4";
const CONTACT = "estudiowebpin@gmail.com";
const SORTEOS = ["Todos","Previa","Primera","Matutina","Vespertina","Nocturna"];
const KINO: Record<number,string> = {0:"Huevos",1:"Agua",2:"Nino",3:"San Cono",4:"Cama",5:"Gato",6:"Perro",7:"Revolver",8:"Incendio",9:"Arroyo",10:"Canon",11:"Minero",12:"Soldado",13:"Yeta",14:"Borracho",15:"Nina bonita",16:"Anillo",17:"Desgracia",18:"Sangre",19:"Pescado",20:"Fiesta",21:"Mujer",22:"Loco",23:"Cocinero",24:"Caballo",25:"Gallina",26:"Misa",27:"Peine",28:"Cerro",29:"San Pedro",30:"Santa Rosa",31:"Luz",32:"Dinero",33:"Cristo",34:"Cabeza",35:"Pajarito",36:"Manteca",37:"Dentista",38:"Piedras",39:"Lluvia",40:"Cura",41:"Cuchillo",42:"Zapatillas",43:"Balcon",44:"Carcel",45:"Vino",46:"Tomates",47:"Muerto",48:"Muerto habla",49:"Carne",50:"Pan",51:"Serrucho",52:"Madre",53:"Barco",54:"Vaca",55:"Musica",56:"Caida",57:"Jorobado",58:"Ahogado",59:"Planta",60:"Virgen",61:"Escopeta",62:"Inundacion",63:"Casamiento",64:"Llanto",65:"Cazador",66:"Lombriz",67:"Vibora",68:"Sobrinos",69:"Vicios",70:"Muerto sueno",71:"Excremento",72:"Sorpresa",73:"Hospital",74:"Gente negra",75:"Payaso",76:"Fuego",77:"Pierna mujer",78:"Ramera",79:"Ladron",80:"Bocha",81:"Flores",82:"Pelea",83:"Mal tiempo",84:"Iglesia",85:"Linterna",86:"Humo",87:"Piojos",88:"Papa",89:"Rata",90:"Miedo",91:"Excusado",92:"Medico",93:"Enamorado",94:"Cementerio",95:"Anteojos",96:"Marido",97:"Mesa",98:"Lavandera",99:"Hermano"};
const TESTIMONIOS = [{n:"Carlos M.",c:"Buenos Aires",t:"Llevo 3 meses usando Quiniela IA. El motor con Monte Carlo me da mucha mas confianza para elegir.",s:5},{n:"Laura G.",c:"Rosario",t:"Los numeros calientes que sugiere realmente salen con frecuencia. Muy recomendado.",s:5},{n:"Roberto P.",c:"Cordoba",t:"La redoblona y las 4 cifras del premium son increibles. El sistema tiene bases reales.",s:5},{n:"Marcela S.",c:"Mendoza",t:"Facil de usar y con analisis profundo. Ya no elijo al azar.",s:4},{n:"Diego F.",c:"Mar del Plata",t:"El mapa de calor y la redoblona son herramientas profesionales.",s:5}];
const pad = (n:number,l=2) => String(n).padStart(l,"0");

interface PredItem { numero:string; significado:string; score:number; }
interface RdblItem { num:string; significado:string; redoblonaCount:number; }
interface FreqItem { num:number; total_appearances:number; first_place_count:number; }

export default function PredictionsPage() {
  const [isPremium,setIsPremium]=useState(false);
  const [userEmail,setUserEmail]=useState("");
  const [section,setSection]=useState("pred");
  const [sorteo,setSorteo]=useState("Nocturna");
  const [digits,setDigits]=useState(2);
  const [loading,setLoading]=useState(false);
  const [generated,setGenerated]=useState(false);
  const [apiErr,setApiErr]=useState("");
  const [top10,setTop10]=useState<PredItem[]>([]);
  const [preds3,setPreds3]=useState<string[]>([]);
  const [preds4,setPreds4]=useState<string[]>([]);
  const [redoblona,setRedoblona]=useState("");
  const [rdblList,setRdblList]=useState<RdblItem[]>([]);
  const [freq,setFreq]=useState<FreqItem[]>([]);
  const [totalDraws,setTotalDraws]=useState(0);
  const [tidx,setTidx]=useState(0);
  const timer=useRef<ReturnType<typeof setInterval>|null>(null);

  useEffect(()=>{
    timer.current=setInterval(()=>setTidx(i=>(i+1)%TESTIMONIOS.length),8000);
    return ()=>{if(timer.current)clearInterval(timer.current);};
  },[]);

  useEffect(()=>{
    const raw=localStorage.getItem("sb-wazkylxgqckjfkcmfotl-auth-token");
    if(!raw){window.location.href="/login";return;}
    try{
      const s=JSON.parse(raw);
      if(!s?.access_token){window.location.href="/login";return;}
      if(s.expires_at&&s.expires_at<Math.floor(Date.now()/1000)){localStorage.removeItem("sb-wazkylxgqckjfkcmfotl-auth-token");window.location.href="/login";return;}
      setUserEmail(s.user?.email??"");
      fetch("/api/auth/me",{headers:{Authorization:"Bearer "+s.access_token}}).then(r=>r.ok?r.json():null).then(d=>{if(d?.isPremium)setIsPremium(true);}).catch(()=>{});
    }catch{window.location.href="/login";}
  },[]);

  const fetchData=useCallback(async()=>{
    setLoading(true);setApiErr("");setGenerated(false);
    try{
      const r=await fetch("/api/predictions?sorteo="+encodeURIComponent(sorteo));
      const d=await r.json();
      if(!r.ok)throw new Error(d.error??"Error");
      setTop10(Array.isArray(d.top10)?d.top10:[]);
      setPreds3(Array.isArray(d.predictions3d)?d.predictions3d:[]);
      setPreds4(Array.isArray(d.predictions4d)?d.predictions4d:[]);
      setRedoblona(d.redoblona??"");
      setRdblList(Array.isArray(d.redoblona_pair)?d.redoblona_pair:[]);
      setFreq(Array.isArray(d.frequencyData)?d.frequencyData:[]);
      setTotalDraws(d.totalDraws??0);
      setGenerated(true);
    }catch(e:unknown){setApiErr((e as Error)?.message??String(e));}
    finally{setLoading(false);}
  },[sorteo]);

  const logout=()=>{localStorage.removeItem("sb-wazkylxgqckjfkcmfotl-auth-token");window.location.href="/login";};
  const maxF=freq.length?Math.max(...freq.map(f=>f.total_appearances),1):1;
  const hot5=[...freq].sort((a,b)=>b.total_appearances-a.total_appearances).slice(0,5);
  const cold5=[...freq].sort((a,b)=>a.total_appearances-b.total_appearances).slice(0,5);
  const heatColor=(n:number)=>{const item=freq.find(f=>f.num===n);if(!item)return{bg:"rgba(20,27,42,.6)",bd:"rgba(51,65,85,.4)"};const r=item.total_appearances/maxF;if(r>.75)return{bg:"rgba(239,68,68,.28)",bd:"rgba(239,68,68,.6)"};if(r>.55)return{bg:"rgba(245,158,11,.22)",bd:"rgba(245,158,11,.5)"};if(r>.35)return{bg:"rgba(99,102,241,.18)",bd:"rgba(99,102,241,.4)"};return{bg:"rgba(20,27,42,.5)",bd:"rgba(51,65,85,.3)"};};
  const curPreds=digits===2?top10:digits===3?preds3.map((n,i)=>({numero:n,significado:KINO[parseInt(n.slice(-2))]??"",score:top10[i]?.score??0})):preds4.map((n,i)=>({numero:n,significado:KINO[parseInt(n.slice(-2))]??"",score:top10[i]?.score??0}));

  return(<>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600;700&family=DM+Mono&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      :root{--g:#c9a84c;--gl:#f0cc6e;--gd:#7a6430;--bg:#06080f;--bg3:#161b22;--bd:rgba(255,255,255,.07);--t:#e2e8f0;--dim:#64748b;--ac:#6366f1}
      body{background:var(--bg);color:var(--t);font-family:'DM Sans',sans-serif;min-height:100vh}
      .app{min-height:100vh;background:radial-gradient(ellipse 90% 50% at 50% -15%,rgba(99,102,241,.1),transparent 55%),var(--bg)}
      .nav{position:sticky;top:0;z-index:100;background:rgba(6,8,15,.95);backdrop-filter:blur(24px);border-bottom:1px solid var(--bd);padding:12px 20px;display:flex;align-items:center;justify-content:space-between}
      .nav-l{display:flex;align-items:center;gap:10px;cursor:pointer}
      .nav-ico{width:36px;height:36px;background:linear-gradient(135deg,var(--g),var(--gd));border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px}
      .nav-name{font-family:'Playfair Display',serif;font-size:19px;font-weight:900;background:linear-gradient(135deg,var(--gl),var(--g));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
      .nav-r{display:flex;align-items:center;gap:8px}
      .ppill{background:rgba(201,168,76,.14);border:1px solid rgba(201,168,76,.28);color:var(--g);font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px}
      .nav-email{font-size:11px;color:var(--dim);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .nav-out{padding:6px 12px;border-radius:8px;border:1px solid var(--bd);background:transparent;color:var(--dim);font-size:12px;cursor:pointer;font-family:inherit;transition:.2s}
      .nav-out:hover{border-color:var(--g);color:var(--g)}
      .wrap{max-width:900px;margin:0 auto;padding:28px 16px 80px}
      .hero{text-align:center;padding:10px 0 28px}
      .hero h1{font-family:'Playfair Display',serif;font-size:clamp(28px,6vw,52px);font-weight:900;background:linear-gradient(135deg,var(--gl),var(--g),var(--gd));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
      .hero p{color:var(--dim);font-size:13px;max-width:400px;margin:0 auto 22px;line-height:1.6}
      .stat-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:420px;margin:0 auto}
      .sc{background:rgba(255,255,255,.03);border:1px solid var(--bd);border-radius:12px;padding:12px 6px;text-align:center}
      .sv{font-family:'Playfair Display',serif;font-size:20px;color:var(--g);font-weight:700}
      .sl{font-size:10px;color:var(--dim);margin-top:2px}
      .ctrls{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:20px}
      .sw{flex:1;min-width:140px}
      .sw label{display:block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--dim);margin-bottom:5px}
      select{width:100%;background:var(--bg3);border:1px solid var(--bd);border-radius:10px;color:var(--t);font-size:13px;padding:10px 13px;outline:none;cursor:pointer;font-family:inherit}
      select:focus{border-color:rgba(201,168,76,.4)}
      .gen-btn{padding:11px 22px;background:linear-gradient(135deg,var(--g),var(--gd));color:#000;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:.2s;white-space:nowrap;flex-shrink:0}
      .gen-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 22px rgba(201,168,76,.45)}
      .gen-btn:disabled{opacity:.5;cursor:not-allowed}
      .act-btn{padding:11px 14px;background:linear-gradient(135deg,var(--ac),#4f46e5);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;font-family:inherit;flex-shrink:0}
      .hint{font-size:12px;color:var(--dim);text-align:center;padding:30px 0;line-height:1.9}
      .hint strong{color:var(--g)}
      .stabs{display:flex;background:rgba(255,255,255,.03);border-radius:12px;padding:3px;margin-bottom:22px;gap:2px;overflow-x:auto}
      .stab{flex:1;min-width:80px;padding:9px 6px;text-align:center;border-radius:8px;border:none;background:transparent;color:var(--dim);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit;transition:.2s}
      .stab.on{background:rgba(201,168,76,.11);color:var(--g);border:1px solid rgba(201,168,76,.22)}
      .dtabs{display:flex;gap:6px;margin-bottom:18px}
      .dtab{flex:1;padding:9px 4px;text-align:center;border:1px solid var(--bd);border-radius:10px;background:transparent;color:var(--dim);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;transition:.2s;position:relative}
      .dtab.on{border-color:rgba(201,168,76,.4);color:var(--g);background:rgba(201,168,76,.07)}
      .pbadge{position:absolute;top:-8px;right:4px;background:var(--g);color:#000;font-size:8px;font-weight:700;padding:2px 5px;border-radius:10px}
      .pgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px}
      .pcard{background:rgba(255,255,255,.03);border:1px solid var(--bd);border-radius:14px;padding:14px 6px 10px;text-align:center;transition:.2s}
      .pcard:hover{border-color:rgba(201,168,76,.35);transform:translateY(-2px);background:rgba(201,168,76,.04)}
      .pnum{font-family:'Playfair Display',serif;font-size:clamp(22px,4vw,34px);font-weight:900;background:linear-gradient(135deg,var(--gl),var(--g));-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1}
      .pkino{font-size:9px;color:var(--g);margin-top:4px;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px}
      .prank{font-size:9px;color:var(--dim);margin-top:3px}
      .pscore{font-size:9px;color:#86efac;margin-top:2px;font-family:'DM Mono',monospace}
      .plock{position:relative}
      .plov{position:absolute;inset:0;background:rgba(6,8,15,.94);backdrop-filter:blur(10px);border-radius:12px;border:1px solid rgba(99,102,241,.2);z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px 16px;text-align:center}
      .plov h3{font-family:'Playfair Display',serif;font-size:17px;color:#fff}
      .plov p{font-size:11px;color:var(--dim);max-width:210px;line-height:1.5}
      .ucta{display:inline-block;background:linear-gradient(135deg,var(--ac),#4f46e5);color:#fff;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:600;text-decoration:none}
      .rdbl-box{background:rgba(245,158,11,.04);border:1px solid rgba(245,158,11,.18);border-radius:14px;padding:18px;margin-bottom:14px}
      .rdbl-pair{font-family:'Playfair Display',serif;font-size:36px;font-weight:900;color:#fbbf24;text-align:center;letter-spacing:6px;margin:8px 0}
      .rdbl-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-top:14px}
      .rc{background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.18);border-radius:11px;padding:12px 4px;text-align:center;transition:.2s}
      .rc:hover{border-color:rgba(245,158,11,.5);transform:translateY(-2px)}
      .rc-n{font-family:'Playfair Display',serif;font-size:24px;font-weight:900;color:#fbbf24}
      .rc-k{font-size:9px;color:#fbbf24;opacity:.75;margin-top:2px}
      .rc-c{font-size:9px;color:var(--dim);margin-top:2px}
      .ngrid{display:grid;grid-template-columns:repeat(10,1fr);gap:2px}
      .nc{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:5px;border:1px solid transparent;transition:transform .15s}
      .nc:hover{transform:scale(1.3);z-index:5}
      .nn{font-family:'DM Mono',monospace;font-size:clamp(7px,1.2vw,11px);font-weight:500}
      .nv{font-size:6px;color:var(--dim)}
      .hcg{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}
      .hcc{background:rgba(255,255,255,.02);border:1px solid var(--bd);border-radius:13px;padding:14px}
      .hct{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px}
      .hct.hot{color:#f87171}.hct.cold{color:#60a5fa}
      .hci{display:flex;align-items:center;gap:7px;margin-bottom:8px}
      .hcb{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-family:'DM Mono',monospace;font-weight:500;flex-shrink:0}
      .hcb.hot{background:radial-gradient(circle at 35% 35%,#fca5a5,#dc2626)}
      .hcb.cold{background:radial-gradient(circle at 35% 35%,#93c5fd,#1d4ed8)}
      .hci-r{flex:1;min-width:0}
      .hci-n{font-size:11px;font-family:'DM Mono',monospace}
      .hci-k{font-size:9px;color:var(--g);margin-top:1px}
      .hci-s{font-size:9px;color:var(--dim)}
      .hbar{width:36px;height:3px;background:var(--bg3);border-radius:2px;flex-shrink:0;overflow:hidden}
      .hbar-f{height:100%;border-radius:2px}
      .ibox{background:rgba(99,102,241,.05);border:1px solid rgba(99,102,241,.14);border-radius:9px;padding:10px 14px;font-size:11px;color:var(--dim);line-height:1.8;margin-top:12px}
      .ibox strong{color:#a5b4fc}
      .stit{font-family:'Playfair Display',serif;font-size:15px;color:var(--t);margin-bottom:12px;display:flex;align-items:center;gap:8px}
      .stit::after{content:'';flex:1;height:1px;background:var(--bd)}
      .tst{margin-top:44px;padding-top:28px;border-top:1px solid var(--bd)}
      .tst-h{text-align:center;margin-bottom:20px}
      .tst-h h2{font-family:'Playfair Display',serif;font-size:20px;background:linear-gradient(135deg,var(--gl),var(--g));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
      .tst-h p{font-size:11px;color:var(--dim);margin-top:4px}
      .carousel{overflow:hidden;border-radius:14px}
      .ctrack{display:flex;transition:transform .7s cubic-bezier(.4,0,.2,1)}
      .tcard{flex:0 0 100%;background:rgba(255,255,255,.03);border:1px solid var(--bd);border-radius:14px;padding:22px;text-align:center}
      .ttxt{font-size:13px;line-height:1.7;color:var(--t);margin:8px auto;font-style:italic;max-width:500px}
      .taut{font-size:11px;color:var(--dim);margin-top:6px}
      .dots{display:flex;justify-content:center;gap:5px;margin-top:10px}
      .dot{width:6px;height:6px;border-radius:50%;background:var(--bd);cursor:pointer;transition:all .3s;border:none;padding:0}
      .dot.on{background:var(--g);width:18px;border-radius:3px}
      .pcta{margin-top:32px;background:linear-gradient(135deg,rgba(99,102,241,.07),rgba(201,168,76,.05));border:1px solid rgba(201,168,76,.14);border-radius:16px;padding:24px 16px;text-align:center}
      .pcta h3{font-family:'Playfair Display',serif;font-size:18px;color:#fff;margin-bottom:5px}
      .pcta p{font-size:12px;color:var(--dim);max-width:320px;margin:0 auto 14px;line-height:1.5}
      .footer{margin-top:32px;padding-top:18px;border-top:1px solid var(--bd);text-align:center}
      .footer p{font-size:11px;color:var(--dim);line-height:1.8}
      .footer a{color:var(--g);text-decoration:none}
      .spin{width:28px;height:28px;border:2px solid var(--bd);border-top-color:var(--g);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 12px}
      @keyframes spin{to{transform:rotate(360deg)}}
      .loading{text-align:center;padding:50px 20px;color:var(--dim);font-size:13px}
      .ebox{background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.15);border-radius:8px;padding:10px 13px;font-size:12px;color:#fca5a5;margin-bottom:14px}
      .disc{margin-top:18px;padding:10px;font-size:10px;color:var(--dim);line-height:1.5;text-align:center;opacity:.6}
      @media(max-width:600px){.hcg{grid-template-columns:1fr}.pgrid{gap:4px}.pcard{padding:10px 3px 8px}}
    `}</style>
    <div className="app">
      <nav className="nav">
        <div className="nav-l" onClick={()=>window.scrollTo(0,0)}>
          <div className="nav-ico">🎰</div>
          <span className="nav-name">Quiniela IA</span>
        </div>
        <div className="nav-r">
          {isPremium&&<span className="ppill">✦ PREMIUM</span>}
          {userEmail&&<span className="nav-email">{userEmail.split("@")[0]}</span>}
          <button className="nav-out" onClick={logout}>Salir</button>
        </div>
      </nav>
      <div className="wrap">
        <div className="hero">
          <h1>Predicciones Inteligentes</h1>
          <p>Motor avanzado: Frecuencia · Atraso · Tendencia · Monte Carlo · Ciclos<br/>Datos reales de la Quiniela de la Ciudad de Buenos Aires</p>
          <div className="stat-row">
            <div className="sc"><div className="sv">{totalDraws||"—"}</div><div className="sl">Sorteos</div></div>
            <div className="sc"><div className="sv">{top10[0]?.numero||"—"}</div><div className="sl">Top #1</div></div>
            <div className="sc"><div className="sv">{isPremium?"PRO":"FREE"}</div><div className="sl">Acceso</div></div>
          </div>
        </div>
        <div className="ctrls">
          <div className="sw">
            <label>Sorteo a analizar</label>
            <select value={sorteo} onChange={e=>setSorteo(e.target.value)}>
              {SORTEOS.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <button className="gen-btn" onClick={fetchData} disabled={loading}>
            {loading?"Analizando...":"Generar Prediccion"}
          </button>
          {!isPremium&&<a href={UALA} target="_blank" rel="noopener noreferrer" className="act-btn">Premium</a>}
        </div>
        {apiErr&&<div className="ebox">Error: {apiErr}</div>}
        {!generated&&!loading&&<div className="hint">Selecciona un sorteo y apreta <strong>Generar Prediccion</strong><br/>El motor analiza frecuencia, atraso, tendencia, Monte Carlo y ciclos<br/>sobre los ultimos 365 dias de sorteos reales.</div>}
        {loading&&<div className="loading"><div className="spin"/><div>Ejecutando motor de prediccion...</div></div>}
        {generated&&!loading&&<>
          <div className="stabs">
            <button className={`stab ${section==="pred"?"on":""}`} onClick={()=>setSection("pred")}>Predicciones</button>
            <button className={`stab ${section==="rdbl"?"on":""}`} onClick={()=>setSection("rdbl")}>Redoblona</button>
            <button className={`stab ${section==="freq"?"on":""}`} onClick={()=>setSection("freq")}>Frecuencias</button>
          </div>
          {section==="pred"&&<>
            <div className="stit">Top — Motor Estadistico Avanzado</div>
            <div className="dtabs">
              {[2,3,4].map(d=><button key={d} className={`dtab ${digits===d?"on":""}`} onClick={()=>setDigits(d)}>{d>2&&<span className="pbadge">PRO</span>}{d} digitos</button>)}
            </div>
            <div className={digits>2&&!isPremium?"plock":""}>
              <div className="pgrid">
                {(Array.isArray(curPreds)?curPreds:[]).slice(0,digits===2?10:5).map((p,i)=>(
                  <div className="pcard" key={i}>
                    <div className="pnum">{typeof p==="string"?p:p.numero}</div>
                    <div className="pkino">{typeof p==="string"?KINO[parseInt(p.slice(-2))]??"":p.significado}</div>
                    <div className="prank">#{i+1}</div>
                    <div className="pscore">{typeof p!=="string"&&p.score?p.score.toFixed(2):""}</div>
                  </div>
                ))}
              </div>
              {digits>2&&!isPremium&&<div className="plov"><div style={{fontSize:36}}>🔐</div><h3>Predicciones {digits} digitos</h3><p>Suscribite al Premium para acceder.</p><a href={UALA} target="_blank" rel="noopener noreferrer" className="ucta">$10.000/mes via Uala</a></div>}
            </div>
            <div className="ibox"><strong>Motor (5 factores):</strong> 30% Frecuencia + 25% Atraso + 20% Tendencia + 15% Monte Carlo + 10% Ciclos</div>
            <div style={{marginTop:20}}>
              <div className="stit">Calientes y Frios</div>
              <div className="hcg">
                {[{title:"Mas frecuentes",cls:"hot",data:hot5,grad:"linear-gradient(90deg,#dc2626,#f87171)"},{title:"Menos frecuentes",cls:"cold",data:cold5,grad:"linear-gradient(90deg,#1d4ed8,#60a5fa)"}].map(({title,cls,data,grad})=>(
                  <div className="hcc" key={cls}>
                    <div className={`hct ${cls}`}>{title}</div>
                    {data.map(item=>(
                      <div className="hci" key={item.num}>
                        <div className={`hcb ${cls}`}>{pad(item.num)}</div>
                        <div className="hci-r">
                          <div className="hci-n">{pad(item.num)}</div>
                          <div className="hci-k">{KINO[item.num]}</div>
                          <div className="hci-s">{item.total_appearances}x</div>
                        </div>
                        <div className="hbar"><div className="hbar-f" style={{width:`${(item.total_appearances/maxF)*100}%`,background:grad}}/></div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>}
          {section==="rdbl"&&<>
            <div className="stit">Analisis de Redoblona</div>
            <div className={!isPremium?"plock":""} style={{minHeight:180}}>
              {redoblona&&<div className="rdbl-box"><div style={{fontSize:13,color:"#fbbf24",marginBottom:4}}>Par recomendado</div><div className="rdbl-pair">{redoblona}</div><div style={{fontSize:11,color:"var(--dim)"}}>Apostale a que ambos numeros aparecen en el mismo sorteo.</div></div>}
              {rdblList.length>0&&<div className="rdbl-grid">{rdblList.map((r,i)=><div className="rc" key={i}><div className="rc-n">{r.num}</div><div className="rc-k">{r.significado}</div><div className="rc-c">{r.redoblonaCount}x redoblona</div></div>)}</div>}
              {!isPremium&&<div className="plov" style={{position:"relative",inset:"auto",marginTop:12,padding:22,background:"rgba(6,8,15,.93)",backdropFilter:"blur(8px)",borderRadius:14,border:"1px solid rgba(99,102,241,.2)",display:"flex",flexDirection:"column",alignItems:"center",gap:10,textAlign:"center"}}><div style={{fontSize:32}}>🔐</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:17,color:"#fff"}}>Redoblona Premium</div><a href={UALA} target="_blank" rel="noopener noreferrer" className="ucta">Activar — $10.000/mes</a></div>}
            </div>
          </>}
          {section==="freq"&&<>
            <div className="stit">Mapa de Calor 00-99</div>
            <div className="ngrid">
              {Array.from({length:100},(_,n)=>{const{bg,bd}=heatColor(n);const item=freq.find(f=>f.num===n);return<div key={n} className="nc" style={{background:bg,borderColor:bd}} title={`${pad(n)} - ${KINO[n]} - ${item?.total_appearances??0}x`}><span className="nn">{pad(n)}</span><span className="nv">{item?.total_appearances??0}</span></div>;})}
            </div>
          </>}
        </>}
        <div className="tst">
          <div className="tst-h"><h2>Lo que dicen nuestros usuarios</h2><p>Miles de quinieleros ya confian en Quiniela IA</p></div>
          <div className="carousel">
            <div className="ctrack" style={{transform:`translateX(-${tidx*100}%)`}}>
              {TESTIMONIOS.map((t,i)=><div className="tcard" key={i}><span style={{color:"#f59e0b",fontSize:14}}>{"★".repeat(t.s)}{"☆".repeat(5-t.s)}</span><div className="ttxt">&ldquo;{t.t}&rdquo;</div><div className="taut"><strong style={{color:"var(--t)"}}>{t.n}</strong><span style={{margin:"0 6px",opacity:.3}}>·</span>{t.c}</div></div>)}
            </div>
          </div>
          <div className="dots">{TESTIMONIOS.map((_,i)=><button key={i} className={`dot ${i===tidx?"on":""}`} onClick={()=>setTidx(i)}/>)}</div>
        </div>
        {!isPremium&&<div className="pcta"><div style={{fontSize:28,marginBottom:7}}>🚀</div><h3>Desbloquea todo el potencial</h3><p>Predicciones de 3 y 4 cifras + Redoblona completa.</p><a href={UALA} target="_blank" rel="noopener noreferrer" className="ucta" style={{fontSize:13,padding:"12px 24px"}}>Suscribirme $10.000/mes via Uala</a><div style={{fontSize:10,color:"var(--dim)",marginTop:8}}>Pago seguro · Acceso inmediato · Cancela cuando quieras</div></div>}
        <div className="footer"><p>Soporte: <a href={`mailto:${CONTACT}`}>{CONTACT}</a></p><div className="disc">Herramienta de analisis estadistico. La quiniela es un juego de azar. Juga responsablemente.</div></div>
      </div>
    </div>
  </>);
}
