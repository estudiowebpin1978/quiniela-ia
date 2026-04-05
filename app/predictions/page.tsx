"use client"
import { useState, useEffect, useRef } from "react"
const UALA="https://pagar.ualabis.com.ar/order/df50920d5961bd85d19f4231747cc5d7e6ca0489da6e76a4"
const CONTACT="estudiowebpin@gmail.com"
const WA="https://wa.me/5493412500029?text=Hola!%20Quiero%20activar%20Premium%20de%20Quiniela%20IA."
const APP_URL="https://quiniela-ia-two.vercel.app"
const SORTEOS=["Previa","Primera","Matutina","Vespertina","Nocturna"]
const HORAS:Record<string,string>={Previa:"10:15",Primera:"12:00",Matutina:"15:00",Vespertina:"18:00",Nocturna:"21:00"}
const REVIEWS=[
{n:"Carlos M.",c:"Buenos Aires",t:"El motor estadistico me da mucha mas confianza.",s:5},
{n:"Laura G.",c:"Rosario",t:"Los numeros calientes realmente salen con frecuencia.",s:5},
{n:"Roberto P.",c:"Cordoba",t:"La redoblona del premium es increible.",s:5},
{n:"Marcela S.",c:"Mendoza",t:"Facil de usar. Ya no elijo al azar.",s:4},
{n:"Diego F.",c:"Mar del Plata",t:"El mapa de calor es muy profesional.",s:5},
{n:"Ana B.",c:"Tucuman",t:"Excelente app. El motor es muy preciso.",s:5},
{n:"Jorge R.",c:"Salta",t:"Me ayudo a entender los patrones.",s:4},
{n:"Patricia L.",c:"La Plata",t:"Muy buena app, la recomiendo.",s:5},
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
]
export default function Page(){
  const [pr,setPr]=useState(false)
  const [em,setEm]=useState("")
  const [tab,setTab]=useState("pred")
  const [so,setSo]=useState("Nocturna")
  const [dg,setDg]=useState(2)
  const [ld,setLd]=useState(false)
  const [dn,setDn]=useState(false)
  const [er,setEr]=useState("")
  const [dt,setDt]=useState(null as any)
  const [misPreds,setMisPreds]=useState<any[]>([])
  const [guardando,setGuardando]=useState(false)
  const [guardadoOk,setGuardadoOk]=useState(false)
  const [controlando,setControlando]=useState(false)
  const [showCalc,setShowCalc]=useState(false)
  const [pagandoUala,setPagandoUala]=useState(false)
  const [apCalc,setApCalc]=useState(250)
  const [rdblCalc,setRdblCalc]=useState(1000)
  const [resultadoControl,setResultadoControl]=useState<any>(null)
  const [aiInsight,setAiInsight]=useState("")
  const [stats,setStats]=useState<any>(null)
  const scrollRef=useRef<HTMLDivElement>(null)
  const tkRef=useRef("")
  useEffect(()=>{
    const proj=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").split("//")[1]?.split(".")[0]||"wazkylxgqckjfkcmfotl"
    const raw=localStorage.getItem("sb-"+proj+"-auth-token")
    if(!raw){window.location.href="/login";return}
    try{
      const s=JSON.parse(raw)
      if(!s?.access_token){window.location.href="/login";return}
      if(s.expires_at&&s.expires_at<Math.floor(Date.now()/1000)){localStorage.removeItem("sb-"+proj+"-auth-token");window.location.href="/login";return}
      tkRef.current=s.access_token
      setEm(s.user?.email||"")
      fetch("/api/auth/me",{headers:{Authorization:"Bearer "+s.access_token}}).then(r=>r.ok?r.json():null).then(d=>{if(d?.isPremium)setPr(true)}).catch(()=>{})
      cargarMisPreds(s.access_token)
      fetch("/api/estadisticas").then(r=>r.json()).then(d=>setStats(d)).catch(()=>{})
    }catch{window.location.href="/login"}
  },[])
  useEffect(()=>{
    const el=scrollRef.current;if(!el)return
    let x=0,aid=0
    const step=()=>{x+=0.4;if(x>=el.scrollWidth/2)x=0;el.style.transform=`translateX(-${x}px)`;aid=requestAnimationFrame(step)}
    aid=requestAnimationFrame(step)
    return()=>cancelAnimationFrame(aid)
  },[])

  async function pedirNotificaciones(){
    if(!("Notification" in window)){alert("Tu navegador no soporta notificaciones");return}
    const perm = await Notification.requestPermission()
    if(perm==="granted"){
      localStorage.setItem("notif_enabled","1")
      new Notification("Quiniela IA activado!", {
        body: "Te avisaremos cuando salgan los resultados de cada sorteo.",
        icon: "/icon-192.png"
      })
    }
  }
  function mostrarNotifResultado(turno:string, numeros:string[], acertos:string[]){
    if(!("Notification" in window)||Notification.permission!=="granted")return
    const msg = acertos.length>0
      ? "Acertaste "+acertos.length+" numero(s)! "+acertos.join(", ")+" en el "+turno
      : "Resultados del "+turno+" disponibles. Genera nueva prediccion."
    new Notification("Quiniela IA - "+turno, {body:msg, icon:"/icon-192.png"})
  }
  async function gen(){
    setLd(true);setEr("");setDn(false);setDt(null)
    try{
      const r=await fetch("/api/predictions?sorteo="+encodeURIComponent(so),{headers:{Authorization:"Bearer "+tkRef.current}})
      const d=await r.json()
      if(!r.ok)throw new Error(d.error||"Error")
      setDt(d);setDn(true);if(d.aiInsight)setAiInsight(d.aiInsight)
    }catch(e:any){setEr(e?.message||String(e))}
    finally{setLd(false)}
  }
  function logout(){
    const proj=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").split("//")[1]?.split(".")[0]||"wazkylxgqckjfkcmfotl"
    localStorage.removeItem("sb-"+proj+"-auth-token");window.location.href="/login"
  }
  function proximoSorteo(sorteo:string):string{
    const ar=new Date(Date.now()-3*3600000)
    const hora=ar.getHours()*100+ar.getMinutes()
    const hoy=ar.toLocaleDateString("es-AR",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"})
    const manana=new Date(ar.getTime()+86400000).toLocaleDateString("es-AR",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"})
    const h:Record<string,number>={Previa:1015,Primera:1200,Matutina:1500,Vespertina:1800,Nocturna:2100}
    return hora<(h[sorteo]||2100)?sorteo+" del "+hoy:sorteo+" del "+manana
  }
  async function cargarMisPreds(token:string){
    try{
      const r=await fetch("/api/mis-predicciones",{headers:{Authorization:"Bearer "+token}})
      const d=await r.json();if(d.predictions)setMisPreds(d.predictions)
    }catch{}
  }


  async function pagarUala(){
    if(!em){alert("Necesitas estar logueado");return}
    setPagandoUala(true)
    try{
      const r=await fetch("/api/pago-uala",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:em})})
      const d=await r.json()
      if(d.link){
        window.open(d.link,"_blank")
      }else{
        alert("Error generando link de pago: "+(d.error||"intenta por WhatsApp"))
      }
    }catch(e:any){alert("Error: "+e.message)}
    setPagandoUala(false)
  }
  async function controlarJugada(){
    if(!dt?.numeros?.length){alert("Primero genera una prediccion");return}
    setControlando(true);setResultadoControl(null)
    try{
      const hoy=new Date(Date.now()-3*3600000).toISOString().split("T")[0]
      // Buscar resultado real via API
      const r2=await fetch(`/api/resultado?date=${hoy}&turno=${encodeURIComponent(so)}`)
      const drawData=await r2.json()
      if(!drawData?.found||!drawData?.numbers?.length){
        setResultadoControl({error:"Todavia no hay resultado para este sorteo. Los crons cargan los datos 30 minutos despues de cada sorteo."})
        return
      }
      const reales=drawData.numbers.map((n:any)=>String(Number(n)%100).padStart(2,"0"))
      const predichos=cur.slice(0,dg===2?10:5).map((p:any)=>p.numero)
      const aciertos=predichos.filter((n:string)=>reales.includes(n)).map((n:string)=>({numero:n,puesto:reales.indexOf(n)+1}))
      setResultadoControl({aciertos,predichos,reales,fecha:hoy,turno:so})
    }catch(e:any){setResultadoControl({error:"Error: "+e.message})}
    setControlando(false)
  }
  async function guardarPrediccion(){
    if(!tkRef.current)return
    setGuardando(true)
    try{
      const hoy=new Date(Date.now()-3*3600000).toISOString().split("T")[0]
      const nums=cur.slice(0,dg===2?10:5).map((p:any)=>p.numero)
      await fetch("/api/mis-predicciones",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+tkRef.current},body:JSON.stringify({date:hoy,turno:so,numeros:nums})})
      setGuardadoOk(true);setTimeout(()=>setGuardadoOk(false),3000)
      cargarMisPreds(tkRef.current)
    }catch{}
    setGuardando(false)
  }
  function copiar(){
    if(!dt?.numeros?.length){alert("Primero genera una prediccion");return}
    const lineas=cur.slice(0,dg===2?10:5).map((p:any,i:number)=>"#"+(i+1)+" "+p.numero+" - "+p.significado).join("\n")
    const rdblLine=dt?.redoblona?"\nRedoblona: "+dt.redoblona:""
    const txt="QUINIELA IA - "+proximoSorteo(so)+"\n\n"+lineas+rdblLine+"\n\n"+APP_URL
    navigator.clipboard.writeText(txt).then(()=>alert("Copiado!")).catch(()=>{const el=document.createElement("textarea");el.value=txt;document.body.appendChild(el);el.select();document.execCommand("copy");document.body.removeChild(el);alert("Copiado!")})
  }
  function share(p:string){
    const txt=encodeURIComponent("Proba Quiniela IA - Predicciones estadisticas reales")
    const url=encodeURIComponent(APP_URL)
    if(p==="copy"){navigator.clipboard.writeText(APP_URL).then(()=>alert("Link copiado!"));return}
    const urls:any={whatsapp:`https://wa.me/?text=${txt}%20${url}`,facebook:`https://www.facebook.com/sharer/sharer.php?u=${url}`,twitter:`https://twitter.com/intent/tweet?text=${txt}&url=${url}`,telegram:`https://t.me/share/url?url=${url}&text=${txt}`}
    window.open(urls[p],"_blank")
  }
  const nums:any[]=dt?.numeros||[]
  const rdbl:string=dt?.redoblona||""
  const r5:any[]=dt?.rdblTop5||[]
  const p3:string[]=dt?.pred3d||[]
  const p4:string[]=dt?.pred4d||[]
  const hm:any[]=dt?.heatmap||[]
  const mxH=hm.length?Math.max(...hm.map((x:any)=>x.f),1):1
  const cur=dg===2?nums:dg===3?p3.map((n:string,i:number)=>({numero:n,significado:nums[i]?.significado||"",score:nums[i]?.score||0})):p4.map((n:string,i:number)=>({numero:n,significado:nums[i]?.significado||"",score:nums[i]?.score||0}))
  function hc(f:number){const r=f/mxH;if(r>.75)return{bg:"rgba(254,44,85,.25)",bd:"rgba(254,44,85,.5)"};if(r>.55)return{bg:"rgba(37,244,238,.15)",bd:"rgba(37,244,238,.4)"};if(r>.35)return{bg:"rgba(99,102,241,.15)",bd:"rgba(99,102,241,.35)"};return{bg:"rgba(20,27,42,.5)",bd:"rgba(51,65,85,.3)"}}
  return(<>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      :root{--red:#FE2C55;--cyan:#25F4EE;--dark:#010101;--card:#0d0d0d;--t:#FFFFFF;--dim:#94a3b8}
      body{background:var(--dark);color:var(--t);font-family:'Inter',sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased}
      .app{min-height:100vh;background:radial-gradient(ellipse 80% 40% at 50% -5%,rgba(254,44,85,.08),transparent 50%),#010101}
      .nav{position:sticky;top:0;z-index:100;background:rgba(6,8,15,.98);backdrop-filter:blur(24px);border-bottom:1px solid rgba(255,255,255,.08);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;}
      .nl{display:flex;align-items:center;gap:9px;cursor:pointer}
      .ni{width:34px;height:34px;background:linear-gradient(135deg,#FE2C55,#aa0030);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 3px 0 #700020}
      .nm{font-size:18px;font-weight:900;background:linear-gradient(135deg,#ff7090,#FE2C55);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
      .nr{display:flex;align-items:center;gap:7px}
      .pp{background:linear-gradient(135deg,#20d5ec,#00a8c8);color:#001a20;font-size:9px;font-weight:800;padding:3px 8px;border-radius:20px}
      .ne{font-size:11px;color:var(--dim);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .nav-admin{padding:5px 10px;border-radius:7px;border:1px solid rgba(255,45,85,.3);background:transparent;color:#ff6b81;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:none}
      .nav-out{padding:5px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.1);background:transparent;color:var(--dim);font-size:11px;cursor:pointer;font-family:inherit}
      .wr{max-width:480px;margin:0 auto;padding:20px 14px 80px}
      .hero{text-align:center;padding:8px 0 24px}
      .hero h1{font-size:clamp(26px,7vw,48px);font-weight:900;background:linear-gradient(135deg,#FFFFFF,#ff7090,#FE2C55);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px;line-height:1.1;letter-spacing:-1px}
      .hero p{color:#94a3b8;font-size:13px;max-width:340px;margin:0 auto 16px;line-height:1.7;font-weight:400}
      .sts{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-width:320px;margin:0 auto}
      .sc{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px 8px;text-align:center}
      .sv{font-size:20px;font-weight:900;background:linear-gradient(135deg,#ff9090,#FE2C55);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
      .sl{font-size:10px;color:#64748b;margin-top:3px;font-weight:500;letter-spacing:.3px}
      .sorteo-label{font-size:10px;font-weight:700;color:var(--dim);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;text-align:center}
      .sorteo-btns{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:14px}
      .sb{padding:13px 4px 10px;border-radius:13px;background:linear-gradient(180deg,#1a1a1a,#0d0d0d);color:#94a3b8;border:1.5px solid rgba(255,255,255,.1);box-shadow:0 5px 0 #03030a,0 6px 15px rgba(0,0,0,.4);cursor:pointer;font-family:'Inter',sans-serif;font-weight:800;font-size:12px;text-align:center;transition:.12s;display:flex;flex-direction:column;align-items:center;gap:5px;user-select:none;letter-spacing:.2px}
      .sb .sh{font-size:10px;font-weight:600;opacity:.8;color:#64748b}
      .sb:active{transform:translateY(3px);box-shadow:none}
      .sb.on{background:linear-gradient(180deg,#25F4EE,#00c8c0);color:#000;border-color:rgba(37,244,238,.9);box-shadow:0 5px 0 #007070,0 6px 20px rgba(37,244,238,.4);font-size:13px}
      .sb.on .sh{opacity:1;color:#004d5c;font-weight:700;font-size:11px}
      .sb:hover:not(.on){background:linear-gradient(180deg,#1a1a1a,#111);color:#25F4EE;border-color:rgba(37,244,238,.2)}
      .btn3d{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;border:none;border-radius:13px;font-family:'Inter',sans-serif;font-weight:800;cursor:pointer;transition:transform .08s,box-shadow .08s;user-select:none;-webkit-tap-highlight-color:transparent;width:100%;margin-bottom:8px}
      .btn3d:active{transform:translateY(4px)!important;box-shadow:none!important}
      .btn-gen{padding:18px 24px;font-size:16px;letter-spacing:.3px;background:linear-gradient(135deg,#FE2C55,#ff5070);color:#fff;box-shadow:0 6px 0 #900020,0 8px 28px rgba(254,44,85,.45),inset 0 1px 0 rgba(255,255,255,.15)}
      .btn-gen:hover{background:linear-gradient(135deg,#ff4060,#ff7d90)}
      .btn-prem{padding:14px 20px;font-size:13px;background:linear-gradient(135deg,#25F4EE,#00c8c0);color:#000;box-shadow:0 5px 0 #007070,0 7px 20px rgba(37,244,238,.35)}
      .btn-copy{padding:12px 20px;font-size:13px;background:linear-gradient(135deg,#2e2e3e,#1a1a28);color:#a5b4fc;border:1.5px solid rgba(99,102,241,.3);box-shadow:0 4px 0 #0a0a18}
      .btn-save{padding:12px 20px;font-size:13px;background:linear-gradient(135deg,#1e3a2e,#0f2018);color:#86efac;border:1.5px solid rgba(34,197,94,.25);box-shadow:0 4px 0 #051008}
      .dtabs{display:flex;gap:6px;margin-bottom:14px}
      .dk{flex:1;padding:12px 4px;text-align:center;border-radius:12px;font-family:'Inter',sans-serif;font-weight:800;font-size:13px;cursor:pointer;position:relative;transition:.1s;user-select:none;border:none;box-shadow:0 5px 0 rgba(0,0,0,.5)}
      .dk:active{transform:translateY(4px);box-shadow:none}
      .dk-2{background:linear-gradient(180deg,#FE2C55,#cc0030);color:#fff;box-shadow:0 5px 0 #800020}
      .dk-3{background:linear-gradient(180deg,#25F4EE,#00c0b8);color:#000;box-shadow:0 5px 0 #007070}
      .dk-4{background:linear-gradient(180deg,#f59e0b,#d97706);color:#1a0e00;box-shadow:0 5px 0 #7c3f00}
      .dk.on{filter:brightness(1.15);box-shadow:0 2px 0 rgba(0,0,0,.5)}
      .dk:not(.on){opacity:.5}
      .pbdg{position:absolute;top:-8px;right:3px;background:#fff;color:#001a20;font-size:7px;font-weight:800;padding:2px 6px;border-radius:8px}
      .g5{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:12px}
      .cd{background:linear-gradient(145deg,#1a1a1a,#0f0f0f);border:1.5px solid rgba(254,44,85,.2);border-radius:14px;padding:15px 3px 10px;text-align:center;position:relative;box-shadow:0 5px 0 #060108,0 8px 20px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06);transition:.2s;cursor:default}
      .cd:hover{transform:translateY(-2px);border-color:rgba(255,45,85,.45);box-shadow:0 6px 0 #060108,0 8px 20px rgba(255,45,85,.15)}
      .cr2{position:absolute;top:4px;left:5px;font-size:9px;color:#94a3b8;font-weight:800}
      .cn{font-size:clamp(24px,6vw,36px);font-weight:900;background:linear-gradient(135deg,#ff9090,#FE2C55);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1;margin-bottom:5px;letter-spacing:-1px}
      .cs{font-size:10px;color:#ffb3bf;font-weight:600;padding:0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.2px}
      .lk{position:relative}
      .lo{position:absolute;inset:0;background:rgba(6,8,15,.93);backdrop-filter:blur(8px);border-radius:12px;border:1px solid rgba(32,213,236,.2);z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:20px 14px;text-align:center}
      .lo h3{font-size:15px;color:#fff;font-weight:700}
      .lo p{font-size:11px;color:var(--dim);max-width:200px;line-height:1.5}
      .uc{display:inline-block;background:linear-gradient(135deg,#20d5ec,#00a8c8);color:#001a20;border-radius:10px;padding:9px 16px;font-size:12px;font-weight:800;text-decoration:none;margin-bottom:4px}
      .tbs{display:flex;gap:5px;margin-bottom:18px;overflow-x:auto;padding-bottom:2px}
      .tb{flex:1;min-width:72px;padding:11px 4px;text-align:center;border-radius:12px;border:none;font-family:'Inter',sans-serif;font-weight:800;font-size:11px;cursor:pointer;white-space:nowrap;transition:.1s;user-select:none;display:flex;flex-direction:column;align-items:center;gap:3px;box-shadow:0 4px 0 rgba(0,0,0,.4)}
      .tb:active{transform:translateY(3px);box-shadow:none}
      .tb-pred{background:linear-gradient(180deg,#1e1e2e,#12121e);color:#64748b;border:1.5px solid rgba(255,255,255,.08)}
      .tb-pred.on{background:linear-gradient(180deg,#FE2C55,#cc0030);color:#fff;border-color:#FE2C55;box-shadow:0 4px 0 #800020}
      .tb-rdbl{background:linear-gradient(180deg,#1e1e2e,#12121e);color:#64748b;border:1.5px solid rgba(255,255,255,.08)}
      .tb-rdbl.on{background:linear-gradient(180deg,#25F4EE,#00c0b8);color:#000;border-color:#25F4EE;box-shadow:0 4px 0 #007070}
      .tb-freq{background:linear-gradient(180deg,#1e1e2e,#12121e);color:#64748b;border:1.5px solid rgba(255,255,255,.08)}
      .tb-freq.on{background:linear-gradient(180deg,#a78bfa,#5b21b6);color:#fff;border-color:#a78bfa;box-shadow:0 4px 0 #2e1065}
      .tb-mis{background:linear-gradient(180deg,#1e1e2e,#12121e);color:#64748b;border:1.5px solid rgba(255,255,255,.08)}
      .tb-mis.on{background:linear-gradient(180deg,#22c55e,#15803d);color:#fff;border-color:#22c55e;box-shadow:0 4px 0 #064e24}
      .tb .tb-ico{font-size:16px}
      .tb .tb-lbl{font-size:10px}
      .ibox{background:rgba(255,45,85,.05);border:1px solid rgba(255,45,85,.15);border-radius:10px;padding:12px 14px;font-size:12px;color:#94a3b8;line-height:1.8;margin-top:10px}
      .ibox strong{color:#ff9999}
      .rdbl{background:rgba(37,244,238,.04);border:1px solid rgba(37,244,238,.2);border-radius:14px;padding:16px;margin-bottom:12px}
      .rpair{font-size:36px;font-weight:900;background:linear-gradient(135deg,#25F4EE,#69C9D0);-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-align:center;letter-spacing:8px;margin:10px 0}
      .rg{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:12px}
      .rc{background:rgba(32,213,236,.06);border:1px solid rgba(32,213,236,.18);border-radius:10px;padding:10px 4px;text-align:center;transition:.15s}
      .rc:hover{border-color:rgba(32,213,236,.5);transform:translateY(-2px)}
      .rn{font-size:22px;font-weight:900;color:#20d5ec}
      .rk{font-size:8px;color:#20d5ec;opacity:.75;margin-top:2px}
      .rv{font-size:8px;color:var(--dim);margin-top:2px}
      .hm{display:grid;grid-template-columns:repeat(10,1fr);gap:2px}
      .hc{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:5px;border:1px solid transparent;cursor:default;transition:.15s}
      .hc:hover{transform:scale(1.3);z-index:5}
      .hn{font-size:clamp(7px,1.2vw,10px)}
      .hv{font-size:6px;color:var(--dim)}
      .tips{background:rgba(255,45,85,.04);border:1px solid rgba(255,45,85,.15);border-radius:14px;padding:14px;margin-bottom:14px}
      .tips-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
      .tip-box{border-radius:10px;padding:10px 6px;border:1px solid}
      .tip-n{padding:2px 5px;border-radius:4px;font-size:10px;font-weight:800}
      .shr{margin-top:24px;padding:16px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:14px;text-align:center}
      .shr-t{font-size:12px;font-weight:700;color:var(--t);margin-bottom:12px}
      .shr-b{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
      .sbt{padding:8px 14px;border:none;border-radius:9px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 3px 0 rgba(0,0,0,.4);transition:.08s;user-select:none}
      .sbt:active{transform:translateY(2px);box-shadow:none}
      .sbt.wa{background:#25D366;color:#fff}.sbt.fb{background:#1877F2;color:#fff}.sbt.tw{background:#000;color:#fff}.sbt.tg{background:#0088cc;color:#fff}.sbt.cp{background:rgba(255,255,255,.08);color:var(--t);border:1px solid rgba(255,255,255,.1)}
      .rev{margin-top:28px;padding-top:22px;border-top:1px solid rgba(255,255,255,.06)}
      .rev-o{overflow:hidden;position:relative}
      .rev-o::before,.rev-o::after{content:'';position:absolute;top:0;bottom:0;width:50px;z-index:2;pointer-events:none}
      .rev-o::before{left:0;background:linear-gradient(to right,var(--dark),transparent)}
      .rev-o::after{right:0;background:linear-gradient(to left,var(--dark),transparent)}
      .rev-tr{display:flex;gap:10px;width:max-content}
      .rev-c{width:240px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:12px;flex-shrink:0}
      .rev-s{color:#ff2d55;font-size:11px;margin-bottom:5px}
      .rev-t{font-size:11px;color:var(--t);font-style:italic;line-height:1.5;margin-bottom:5px}
      .rev-a{font-size:10px;color:var(--dim)}
      .rev-a strong{color:var(--t)}
      .pay-box{margin-top:24px;background:linear-gradient(135deg,rgba(37,244,238,.05),rgba(0,192,184,.03));border:1.5px solid rgba(37,244,238,.2);border-radius:18px;padding:24px 18px;text-align:center;box-shadow:0 8px 32px rgba(32,213,236,.08)}
      .pay-box h3{font-size:16px;font-weight:800;color:#fff;margin-bottom:4px}
      .pay-alias{padding:10px 14px;background:rgba(37,244,238,.08);border:1px solid rgba(37,244,238,.2);border-radius:10px;font-size:14px;font-weight:900;color:#25F4EE;letter-spacing:2px;margin-bottom:8px}
      .ft{margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,.05);text-align:center}
      .ft p{font-size:11px;color:var(--dim);line-height:1.9}
      .ft a{color:#ff6b81;text-decoration:none}
      .credit{font-size:11px;color:#475569;margin-top:10px;letter-spacing:.3px}
      .credit strong{color:#64748b}
      .dc{margin-top:12px;font-size:9px;color:#374151;line-height:1.6;text-align:center}
      .calc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px}
      .calc-card{border-radius:12px;padding:12px 10px;text-align:center}
      .calc-card-t{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
      .calc-card-v{font-size:16px;font-weight:900;margin-bottom:3px}
      .calc-card-s{font-size:9px;opacity:.7;line-height:1.5}
      .sp{width:26px;height:26px;border:2px solid rgba(255,255,255,.1);border-top-color:#ff2d55;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 10px}
      @keyframes spin{to{transform:rotate(360deg)}}
      .ld-box{text-align:center;padding:40px 20px;color:var(--dim);font-size:13px}
      .eb{background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.15);border-radius:8px;padding:10px 12px;font-size:12px;color:#fca5a5;margin-bottom:12px}
      .ht{font-size:12px;color:var(--dim);text-align:center;padding:24px 0;line-height:2}
      .ht strong{color:#ff6b81}
      .sec{font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 10px;display:flex;align-items:center;gap:8px}
      .sec::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.05)}
      @media(max-width:400px){.g5{gap:3px}.cd{padding:10px 2px 7px}.tips-grid{grid-template-columns:1fr}}
    `}</style>
    <div className="app">
      <nav className="nav">
        <div className="nl" onClick={()=>window.scrollTo(0,0)}>
          <div className="ni">🎰</div>
          <span className="nm">Quiniela IA</span>
        </div>
        <div className="nr">
          {pr&&<span className="pp">PREMIUM</span>}
          {em&&<span className="ne">{em.split("@")[0]}</span>}
          {pr&&<a href="/admin" className="nav-admin">Admin</a>}
          <button onClick={pedirNotificaciones} style={{padding:"5px 10px",borderRadius:7,border:"1px solid rgba(37,244,238,.2)",background:"transparent",color:"#25F4EE",fontSize:11,cursor:"pointer",fontFamily:"inherit"}} title="Tocar para activar notificaciones de resultados">🔔</button>
          <button className="nav-out" onClick={logout}>Salir</button>
        </div>
      </nav>
      <div className="wr">
        <div className="hero">
          <h1>Predicciones Inteligentes</h1>
          <p>Analisis estadistico real de la Quiniela Nacional de Buenos Aires. Motor con 6 factores y datos actualizados automaticamente.</p>
          <div className="sts">
            <div className="sc"><div className="sv">{stats?.pct||"--"}%</div><div className="sl">Aciertos 30 sorteos</div></div>
            <div className="sc"><div className="sv">{stats?.racha||"--"}</div><div className="sl">Racha actual</div></div>
            <div className="sc"><div className="sv">{stats?.totalSorteos||"--"}</div><div className="sl">Sorteos analizados</div></div>
          </div>
          
          {stats?.mensaje&&<div style={{fontSize:11,color:"#20d5ec",background:"rgba(32,213,236,.07)",border:"1px solid rgba(32,213,236,.2)",borderRadius:20,padding:"5px 14px",marginTop:8,display:"inline-block"}}>{stats.mensaje}</div>}
        </div>
        <div style={{fontSize:13,fontWeight:700,color:"#94a3b8",marginBottom:8,textAlign:"center"}}>🎯 Elegí el sorteo que querés analizar:</div>
        <div className="sorteo-btns">
          {SORTEOS.map(s=>(
            <button key={s} className={"sb"+(so===s?" on":"")} onClick={()=>setSo(s)}>
              <span>{s==="Vespertina"?"Vesp":s==="Primera"?"1era":s==="Matutina"?"Mat":s==="Nocturna"?"Noct":s}</span>
              <span className="sh">{HORAS[s]}</span>
            </button>
          ))}
        </div>
        <button className="btn3d btn-gen" onClick={gen} disabled={ld} style={{opacity:ld?.6:1}}>{ld?"⏳ Analizando datos...":"⚡ Generar Predicción Ahora"}</button>
        {dn&&<button onClick={controlarJugada} disabled={controlando} style={{width:"100%",padding:"13px",borderRadius:13,border:"1.5px solid rgba(32,213,236,.3)",background:"rgba(32,213,236,.08)",color:"#20d5ec",fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"'Inter',sans-serif",marginBottom:8,boxShadow:"0 4px 0 rgba(0,168,200,.3)",transition:".1s"}}>
          {controlando?"⏳ Verificando...":"🎯 Controlar Jugada"}
        </button>}
        {dn&&<button onClick={()=>setShowCalc(!showCalc)} style={{width:"100%",padding:"13px",borderRadius:13,border:"1.5px solid rgba(201,168,76,.3)",background:"rgba(201,168,76,.08)",color:"#c9a84c",fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"'Inter',sans-serif",marginBottom:8,boxShadow:"0 4px 0 rgba(100,80,0,.3)",transition:".1s"}}>
          {showCalc?"▲ Cerrar calculadora":"💰 Sugerencias de apuesta"}
        </button>}
        {showCalc&&dn&&<div style={{background:"rgba(201,168,76,.04)",border:"1.5px solid rgba(201,168,76,.2)",borderRadius:16,padding:"16px",marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:800,color:"#c9a84c",marginBottom:12,textAlign:"center"}}>Calculadora de premios estimados</div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{fontSize:11,color:"#94a3b8",minWidth:130}}>Apuesta por cifra: <strong style={{color:"#f0cc6e"}}>${apCalc.toLocaleString("es-AR")}</strong></div>
            <input type="range" min={100} max={2000} step={100} value={apCalc} onChange={(e:any)=>setApCalc(Number(e.target.value))} style={{flex:1,accentColor:"#c9a84c"}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <div style={{fontSize:11,color:"#94a3b8",minWidth:130}}>Apuesta redoblona: <strong style={{color:"#f0cc6e"}}>${rdblCalc.toLocaleString("es-AR")}</strong></div>
            <input type="range" min={200} max={5000} step={100} value={rdblCalc} onChange={(e:any)=>setRdblCalc(Number(e.target.value))} style={{flex:1,accentColor:"#c9a84c"}}/>
          </div>
          <div className="calc-grid">
            <div className="calc-card" style={{background:"rgba(255,45,85,.08)",border:"1px solid rgba(255,45,85,.2)"}}>
              <div className="calc-card-t" style={{color:"#ff6b81"}}>2 cifras</div>
              <div className="calc-card-v" style={{color:"#ff6b81"}}>${(apCalc*70+apCalc*7).toLocaleString("es-AR")}</div>
              <div className="calc-card-s" style={{color:"#ff9999"}}>si sale al 1ro<br/>Apuesta: ${(apCalc*2).toLocaleString("es-AR")}</div>
              <div className="calc-card-s" style={{color:"#ff9999",marginTop:4}}>${(apCalc*7).toLocaleString("es-AR")} del 2 al 10</div>
            </div>
            <div className="calc-card" style={{background:"rgba(32,213,236,.06)",border:"1px solid rgba(32,213,236,.18)"}}>
              <div className="calc-card-t" style={{color:"#20d5ec"}}>3 cifras PRO</div>
              <div className="calc-card-v" style={{color:"#20d5ec"}}>${Math.round((apCalc*600+apCalc*60)*0.721).toLocaleString("es-AR")}</div>
              <div className="calc-card-s" style={{color:"#7dd9d7"}}>si sale al 1ro*<br/>Apuesta: ${(apCalc*2).toLocaleString("es-AR")}</div>
              <div className="calc-card-s" style={{color:"#7dd9d7",marginTop:4}}>${(apCalc*60).toLocaleString("es-AR")} del 2 al 10</div>
            </div>
            <div className="calc-card" style={{background:"rgba(245,158,11,.06)",border:"1px solid rgba(245,158,11,.2)"}}>
              <div className="calc-card-t" style={{color:"#f59e0b"}}>4 cifras PRO</div>
              <div className="calc-card-v" style={{color:"#f59e0b"}}>${Math.round((apCalc*3500+apCalc*350)*0.721).toLocaleString("es-AR")}</div>
              <div className="calc-card-s" style={{color:"#fbbf24"}}>si sale al 1ro*<br/>Apuesta: ${(apCalc*2).toLocaleString("es-AR")}</div>
              <div className="calc-card-s" style={{color:"#fbbf24",marginTop:4}}>${(apCalc*350).toLocaleString("es-AR")} del 2 al 10</div>
            </div>
            <div className="calc-card" style={{background:"rgba(134,239,172,.06)",border:"1px solid rgba(134,239,172,.2)"}}>
              <div className="calc-card-t" style={{color:"#86efac"}}>Redoblona</div>
              <div className="calc-card-v" style={{color:"#86efac"}}>${(rdblCalc*70*7).toLocaleString("es-AR")}</div>
              <div className="calc-card-s" style={{color:"#bbf7d0"}}>par exacto<br/>Apuesta: ${rdblCalc.toLocaleString("es-AR")}</div>
            </div>
          </div>
          <div style={{fontSize:9,color:"#475569",marginTop:10,textAlign:"center",lineHeight:1.6}}>
            * Premios 3 y 4 cifras con descuento AFIP ~27.9%. Valores estimados, sujetos a prorrateo.
          </div>
        </div>}
        {resultadoControl&&<div style={{background:resultadoControl.error?"rgba(239,68,68,.07)":resultadoControl.aciertos?.length>0?"rgba(34,197,94,.08)":"rgba(255,255,255,.03)",border:"1.5px solid "+(resultadoControl.error?"rgba(239,68,68,.2)":resultadoControl.aciertos?.length>0?"rgba(34,197,94,.3)":"rgba(255,255,255,.08)"),borderRadius:14,padding:"16px",marginBottom:12}}>
          {resultadoControl.error?<div style={{fontSize:13,color:"#fca5a5",textAlign:"center"}}>{resultadoControl.error}</div>:<>
            <div style={{fontSize:12,fontWeight:800,color:resultadoControl.aciertos?.length>0?"#86efac":"#94a3b8",marginBottom:10,textAlign:"center"}}>
              {resultadoControl.aciertos?.length>0?"🎉 Acertaste "+resultadoControl.aciertos.length+" numero(s)!":"😔 Sin aciertos esta vez"}
            </div>
            {resultadoControl.aciertos?.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginBottom:10}}>
              {resultadoControl.aciertos.map((a:any,i:number)=>(
                <div key={i} style={{background:"rgba(34,197,94,.15)",border:"1px solid rgba(34,197,94,.4)",borderRadius:10,padding:"6px 12px",textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:900,color:"#86efac"}}>{a.numero}</div>
                  <div style={{fontSize:9,color:"#4ade80"}}>Puesto {a.puesto}</div>
                </div>
              ))}
            </div>}
            <div style={{fontSize:10,color:"#475569",textAlign:"center"}}>
              Sorteo: {resultadoControl.turno} del {resultadoControl.fecha}
            </div>
          </>}
        </div>}
        {er&&<div className="eb">Error: {er}</div>}
        {!dn&&!ld&&<div className="ht">👆 Seleccioná el sorteo de arriba y apretá<br/><strong>⚡ Generar Predicción Ahora</strong><br/><span style={{fontSize:11,color:"#475569"}}>Motor estadístico con datos reales actualizados</span></div>}
        {ld&&<div className="ld-box"><div className="sp"/><div>Ejecutando motor...</div></div>}
        {dn&&!ld&&(<>
          <div style={{background:"rgba(255,45,85,.06)",border:"1px solid rgba(255,45,85,.18)",borderRadius:10,padding:"9px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:12,color:"#ff6b81",fontWeight:700}}>Para: <span style={{color:"#fff"}}>{proximoSorteo(so)}</span></div>
            <button onClick={copiar} style={{padding:"5px 12px",background:"rgba(255,45,85,.1)",border:"1px solid rgba(255,45,85,.25)",borderRadius:8,color:"#ff6b81",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Copiar</button>
          </div>
          {aiInsight&&<div style={{background:"rgba(32,213,236,.05)",border:"1px solid rgba(32,213,236,.18)",borderRadius:12,padding:"12px 14px",marginBottom:14,display:"flex",gap:10,alignItems:"flex-start"}}>
            <div style={{fontSize:20,flexShrink:0}}>🤖</div>
            <div>
              <div style={{fontSize:10,fontWeight:800,color:"#20d5ec",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Analisis IA</div>
              <div style={{fontSize:12,color:"#e2e8f0",lineHeight:1.7}}>{aiInsight}</div>
            </div>
          </div>}
                    <div className="tbs">
            <button className={"tb tb-pred"+(tab==="pred"?" on":"")} onClick={()=>setTab("pred")}><span className="tb-ico">🎯</span><span className="tb-lbl">Predicc.</span></button>
            <button className={"tb tb-rdbl"+(tab==="rdbl"?" on":"")} onClick={()=>setTab("rdbl")}><span className="tb-ico">🎲</span><span className="tb-lbl">Redoblona</span></button>
            <button className={"tb tb-freq"+(tab==="freq"?" on":"")} onClick={()=>setTab("freq")}><span className="tb-ico">🔥</span><span className="tb-lbl">Frecuencias</span></button>
            <button className={"tb tb-mis"+(tab==="mis"?" on":"")} onClick={()=>setTab("mis")}><span className="tb-ico">📋</span><span className="tb-lbl">Mis preds</span></button>
          </div>
          {tab==="pred"&&(<>
            <div className="sec">Motor estadistico avanzado</div>
            <div className="dtabs">
              <button className={"dk dk-2"+(dg===2?" on":"")} onClick={()=>setDg(2)}>2 cifras</button>
              <button className={"dk dk-3"+(dg===3?" on":"")} onClick={()=>setDg(3)}><span className="pbdg">PRO</span>3 cifras</button>
              <button className={"dk dk-4"+(dg===4?" on":"")} onClick={()=>setDg(4)}><span className="pbdg">PRO</span>4 cifras</button>
            </div>
            <div className={dg>2&&!pr?"lk":""}>
              <div className="g5">
                {cur.slice(0,dg===2?10:5).map((p:any,i:number)=>(
                  <div className="cd" key={i}>
                    <div className="cr2">#{i+1}</div>
                    <div className="cn">{p.numero}</div>
                    <div className="cs">{p.significado}</div>
                  </div>
                ))}
              </div>
              {dg>2&&!pr&&(
                <div className="lo">
                  <div style={{fontSize:32}}>🔐</div>
                  <h3>Predicciones {dg} digitos</h3>
                  <p>Suscribite al Premium para acceder.</p>
                  <a href={WA} target="_blank" rel="noopener noreferrer" className="uc">Activar por WhatsApp</a>
                </div>
              )}
            </div>
            <div className="ibox"><strong>Motor 6 factores:</strong> Frecuencia + Atraso + Ciclos + Monte Carlo + Dia semana + Tendencia. Datos reales actualizados automaticamente.</div>
            

          <div style={{display:"flex",gap:8,marginTop:10}}>
              <button className="btn3d btn-save" style={{marginBottom:0}} onClick={guardarPrediccion} disabled={guardando}>{guardando?"Guardando...":guardadoOk?"Guardado!":"Guardar para comparar"}</button>
              <button className="btn3d btn-copy" style={{marginBottom:0}} onClick={copiar}>Copiar</button>
            </div>
          </>)}
          {tab==="rdbl"&&(<>
            <div className="sec">Analisis de redoblona</div>
            <div style={{minHeight:160}}>
              {pr?(<>
                {rdbl&&(<div className="rdbl">
                  <div style={{fontSize:12,color:"#25F4EE",marginBottom:4,fontWeight:700}}>Par optimo recomendado</div>
                  <div className="rpair">{rdbl}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>Apostale a que ambos aparecen en el mismo sorteo.</div>
                </div>)}
                {r5.length>0&&(<div className="rg">{r5.map((r:any,i:number)=>(<div className="rc" key={i}><div className="rn">{r.numero}</div><div className="rk">{r.significado}</div><div className="rv">{r.veces}x redoblona</div></div>))}</div>)}
              </>):(
                <div style={{padding:30,background:"rgba(6,8,15,.95)",backdropFilter:"blur(8px)",borderRadius:14,border:"1px solid rgba(37,244,238,.2)",display:"flex",flexDirection:"column",alignItems:"center",gap:10,textAlign:"center"}}>
                  <div style={{fontSize:36}}>🔐</div>
                  <div style={{fontWeight:800,color:"#fff",fontSize:16}}>Redoblona Premium</div>
                  <div style={{fontSize:12,color:"#94a3b8",maxWidth:200,lineHeight:1.6}}>El par optimo de numeros para redoblona es exclusivo para usuarios Premium.</div>
                  <button onClick={pagarUala} disabled={pagandoUala} style={{background:"linear-gradient(135deg,#25F4EE,#00c0b8)",color:"#000",border:"none",borderRadius:10,padding:"9px 16px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit",marginBottom:6}}>
                    {pagandoUala?"Generando...":"Pagar con Uala"}
                  </button>
                  <a href={WA} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#94a3b8",textDecoration:"none"}}>o envianos el comprobante por WhatsApp</a>
                  <div style={{fontSize:10,color:"#475569"}}>Personal Pay: alopez94.ppay — $10.000/mes</div>
                </div>
              )}
            </div>
          </>)}
          {tab==="freq"&&(<>
            <div className="sec">Mapa de calor 00-99</div>
            <div className="hm">
              {hm.map((c:any)=>{const{bg,bd}=hc(c.f);return(
                <div key={c.n} className="hc" style={{background:bg,borderColor:bd}} title={String(c.n).padStart(2,"0")+" - "+c.s+" - "+c.f+"x"}>
                  <span className="hn">{String(c.n).padStart(2,"0")}</span>
                  <span className="hv">{c.f}</span>
                </div>
              )})}
            </div>
          </>)}
          {tab==="mis"&&(<>
            <div className="sec">Mis predicciones guardadas</div>
            {misPreds.length===0?(<div style={{textAlign:"center",padding:"30px",color:"#64748b",fontSize:12}}>Aun no guardaste predicciones.<br/>Genera una prediccion y apreta Guardar para comparar.</div>):(
              misPreds.map((p:any,i:number)=>(
                <div key={i} style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",borderRadius:12,padding:12,marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{fontSize:12,color:"#ff6b81",fontWeight:700}}>{p.turno} — {new Date(p.date).toLocaleDateString("es-AR")}</div>
                    {p.resultado?<div style={{fontSize:11,fontWeight:700,color:p.acerto?"#86efac":"#475569"}}>{p.acerto?"Acertaste "+p.aciertos.length+"!":"Sin aciertos"}</div>:<div style={{fontSize:10,color:"#475569"}}>Pendiente</div>}
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {p.numeros.map((n:string,j:number)=>{const ac=p.aciertos?.some((a:any)=>a.numero===n);return<span key={j} style={{padding:"2px 6px",borderRadius:4,fontSize:10,fontWeight:700,background:ac?"rgba(134,239,172,.2)":"rgba(255,255,255,.05)",color:ac?"#86efac":"#64748b",border:ac?"1px solid rgba(134,239,172,.4)":"1px solid rgba(255,255,255,.07)"}}>{n}</span>})}
                  </div>
                  {p.aciertos?.length>0&&<div style={{fontSize:10,color:"#86efac",marginTop:6}}>{p.aciertos.map((a:any)=>a.numero+" en puesto "+a.puesto).join(" | ")}</div>}
                </div>
              ))
            )}
          </>)}
        </>)}
        <div className="shr">
          <div className="shr-t">Compartir y ganar Premium gratis</div>
          <div style={{fontSize:11,color:"#25F4EE",background:"rgba(37,244,238,.08)",border:"1px solid rgba(37,244,238,.2)",borderRadius:20,padding:"5px 14px",marginBottom:12,textAlign:"center"}}>
            Compartí la app con amigos y gana 30 dias Premium gratis
          </div>
          <div className="shr-b">
            <button className="sbt wa" onClick={()=>share("whatsapp")}>WhatsApp</button>
            <button className="sbt fb" onClick={()=>share("facebook")}>Facebook</button>
            <button className="sbt tw" onClick={()=>share("twitter")}>X</button>
            <button className="sbt tg" onClick={()=>share("telegram")}>Telegram</button>
            <button className="sbt cp" onClick={()=>share("copy")}>Copiar link</button>
          </div>
          <div style={{fontSize:10,color:"#475569",marginTop:8,textAlign:"center"}}>
            Envia el comprobante de compartir por WhatsApp al {WA.split("?")[0].replace("https://wa.me/","+").replace("549","549 ")} y activamos tu mes gratis
          </div>
        </div>
        <div className="rev">
          <div style={{textAlign:"center",marginBottom:14}}>
            <h2 style={{fontSize:18,fontWeight:800,background:"linear-gradient(135deg,#ff6b81,#ff2d55)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Lo que dicen los usuarios</h2>
            <p style={{fontSize:11,color:"#64748b",marginTop:3}}>Miles de quinieleros confian en Quiniela IA</p>
          </div>
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
        {!pr&&(<div className="pay-box">
          <div style={{fontSize:28,marginBottom:8}}>🚀</div>
          <h3>Desbloqueá el motor completo</h3>
          <p style={{fontSize:11,color:"#64748b",maxWidth:280,margin:"0 auto 14px",lineHeight:1.5}}>Predicciones de 3 y 4 cifras mas Redoblona completa con datos reales.</p>
          <div className="pay-alias">alopez94.ppay</div>
          <div style={{fontSize:10,color:"#475569",marginBottom:12}}>Transferi $10.000 desde tu banco o billetera al alias de Personal Pay</div>
          <button onClick={pagarUala} disabled={pagandoUala} className="btn3d btn-prem" style={{display:"inline-flex",width:"auto",padding:"12px 24px",marginBottom:8,border:"none",cursor:"pointer"}}>
            {pagandoUala?"Generando link...":"Pagar con Ualá — $10.000"}
          </button>
          <div style={{fontSize:11,color:"#475569",marginBottom:8}}>o transferi al alias:</div>
          <a href={WA} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,padding:"10px 20px",background:"#25D366",color:"#fff",borderRadius:10,fontSize:13,fontWeight:700,textDecoration:"none",marginBottom:4}}>
            WhatsApp — Enviar comprobante
          </a>
          <div style={{fontSize:10,color:"#475569",marginTop:6,lineHeight:1.6}}>Sin datos de tarjeta · Paga desde tu banco · Activacion en 24hs</div>
        </div>)}
        <div className="ft">
          <p>Soporte: <a href={"mailto:"+CONTACT}>{CONTACT}</a></p>
          <div className="credit">Desarrollado por <strong>EstudioWebPin</strong> · Autor: <strong>Adrian Hugo Lopez</strong></div>
          <div className="dc">Herramienta de analisis estadistico con fines informativos. No realiza apuestas ni maneja dinero. La Quiniela de la Ciudad es administrada por la Loteria de la Ciudad de Buenos Aires. El juego en exceso puede causar adiccion. Linea gratuita: 0800-333-0062. Solo mayores de 18 anos.</div>
        </div>
      </div>
    </div>
  </>)
}
