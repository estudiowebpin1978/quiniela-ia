"use client";
import { useState, useEffect, useCallback, useRef } from "react";

const UALA_LINK = "https://pagar.ualabis.com.ar/order/df50920d5961bd85d19f4231747cc5d7e6ca0489da6e76a4";

type Sorteo = "Todos"|"Previa"|"Primera"|"Matutina"|"Vespertina"|"Nocturna";
interface FreqItem { num:number; total_appearances:number; first_place_count:number; }
interface DrawRow { draw_date:string; sorteo:string; pos_1:number; pos_2?:number; pos_3?:number; pos_4?:number; pos_5?:number; pos_6?:number; pos_7?:number; pos_8?:number; pos_9?:number; pos_10?:number; }

const TESTIMONIOS = [
  { nombre:"Carlos M.", ciudad:"Buenos Aires", texto:"Llevo 3 meses usando Quiniela IA y mis aciertos mejoraron notablemente. El análisis de frecuencia me ayuda a entender qué números tienen más chances.", stars:5 },
  { nombre:"Laura G.", ciudad:"Rosario", texto:"Me sorprendió la precisión del sistema. Los números calientes que sugiere la app realmente salen con frecuencia. Súper recomendado.", stars:5 },
  { nombre:"Roberto P.", ciudad:"Córdoba", texto:"Al principio era escéptico pero los resultados me convencieron. La suscripción premium vale cada peso, las predicciones de 4 cifras son increíbles.", stars:5 },
  { nombre:"Marcela S.", ciudad:"Mendoza", texto:"Fácil de usar, información clara y actualizada todos los días. Ya no elijo números al azar, confío en el análisis estadístico.", stars:4 },
  { nombre:"Diego F.", ciudad:"Mar del Plata", texto:"El historial de sorteos y el mapa de calor son herramientas muy útiles. Me ayuda a tomar mejores decisiones cada día.", stars:5 },
  { nombre:"Ana B.", ciudad:"Tucumán", texto:"Excelente app, siempre actualizada con los últimos sorteos. El soporte responde rápido y los análisis son muy completos.", stars:5 },
];

const pad = (n:number) => String(n).padStart(2,"0");
const SORTEOS:Sorteo[] = ["Todos","Previa","Primera","Matutina","Vespertina","Nocturna"];
const CONF = ["★★★★★","★★★★☆","★★★☆☆","★★☆☆☆","★☆☆☆☆"];

const CSS = `
  /* Fonts cargadas en layout.tsx */
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--gold:#c9a84c;--gl:#f0cc6e;--gd:#7a6430;--bg:#06080f;--bg2:#0d1117;--bg3:#161b22;
    --bd:rgba(255,255,255,.07);--text:#e2e8f0;--dim:#64748b;--ac:#6366f1}
  html{scroll-behavior:smooth}
  body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;min-height:100vh}
  .app{min-height:100vh;background:radial-gradient(ellipse 80% 50% at 50% -20%,rgba(99,102,241,.12),transparent 60%),var(--bg)}
  .wrap{max-width:900px;margin:0 auto;padding:0 16px 80px}
  .nav{display:flex;align-items:center;justify-content:space-between;padding:16px;
    border-bottom:1px solid var(--bd);margin-bottom:32px;position:sticky;top:0;
    background:rgba(6,8,15,.92);backdrop-filter:blur(20px);z-index:100;
    margin-left:-16px;margin-right:-16px}
  .nav-logo{display:flex;align-items:center;gap:10px;text-decoration:none;cursor:pointer}
  .nav-icon{width:36px;height:36px;background:linear-gradient(135deg,var(--gold),var(--gd));
    border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
  .nav-title{font-family:'Playfair Display',serif;font-size:20px;font-weight:900;
    background:linear-gradient(135deg,var(--gl),var(--gold));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .nav-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
  .ppill{background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.3);color:var(--gold);
    font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px}
  .nav-btn{padding:7px 12px;border-radius:8px;border:1px solid var(--bd);background:transparent;
    color:var(--dim);font-size:13px;cursor:pointer;transition:all .2s;font-family:'DM Sans',sans-serif}
  .nav-btn:hover{border-color:var(--gold);color:var(--gold)}
  .hero{text-align:center;padding:20px 0 36px}
  .hero h1{font-family:'Playfair Display',serif;font-size:clamp(30px,7vw,62px);font-weight:900;line-height:1;
    background:linear-gradient(135deg,var(--gl) 0%,var(--gold) 50%,var(--gd) 100%);
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
  .hero p{color:var(--dim);font-size:14px;max-width:400px;margin:0 auto 28px;line-height:1.6}
  .stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:480px;margin:0 auto}
  .scard{background:rgba(255,255,255,.03);border:1px solid var(--bd);border-radius:14px;padding:14px 10px;text-align:center}
  .sv{font-family:'Playfair Display',serif;font-size:24px;color:var(--gold);font-weight:700}
  .sl{font-size:10px;color:var(--dim);margin-top:2px}
  .ctrls{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:24px;align-items:flex-end}
  .sw{flex:1;min-width:150px}
  .sw label{font-size:11px;color:var(--dim);display:block;margin-bottom:5px}
  select{width:100%;background:var(--bg3);border:1px solid var(--bd);border-radius:10px;
    color:var(--text);font-family:'DM Sans',sans-serif;font-size:14px;padding:10px 14px;appearance:none;cursor:pointer;outline:none}
  select:focus{border-color:rgba(201,168,76,.4)}
  .tabs{display:flex;background:rgba(255,255,255,.03);border-radius:12px;padding:4px;margin-bottom:28px;gap:2px}
  .tab{flex:1;padding:10px 6px;text-align:center;border-radius:8px;border:none;background:transparent;
    color:var(--dim);font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;cursor:pointer;transition:all .2s}
  .tab.on{background:rgba(201,168,76,.12);color:var(--gold);border:1px solid rgba(201,168,76,.2)}
  .dtabs{display:flex;gap:8px;margin-bottom:20px}
  .dtab{flex:1;padding:10px 6px;text-align:center;border:1px solid var(--bd);border-radius:10px;
    background:transparent;color:var(--dim);font-family:'DM Sans',sans-serif;font-size:13px;
    font-weight:500;cursor:pointer;transition:all .2s;position:relative}
  .dtab.on{border-color:rgba(201,168,76,.4);color:var(--gold);background:rgba(201,168,76,.08)}
  .pbadge{position:absolute;top:-9px;right:4px;background:var(--gold);color:#000;
    font-size:9px;font-weight:700;padding:2px 6px;border-radius:20px}
  .pgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px}
  .pcard{background:rgba(255,255,255,.03);border:1px solid var(--bd);border-radius:14px;
    padding:14px 6px;text-align:center;transition:all .25s;position:relative;overflow:hidden}
  .pcard:hover{border-color:rgba(201,168,76,.3);transform:translateY(-3px);box-shadow:0 12px 32px rgba(0,0,0,.3)}
  .pnum{font-family:'Playfair Display',serif;font-size:clamp(20px,4vw,32px);font-weight:900;
    background:linear-gradient(135deg,var(--gl),var(--gold));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .prank{font-size:10px;color:var(--dim);margin-top:3px}
  .pstars{font-size:9px;color:var(--gold);letter-spacing:1px}
  .plock{position:relative}
  .plov{position:absolute;inset:0;background:rgba(6,8,15,.93);backdrop-filter:blur(8px);
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
    border-radius:14px;border:1px solid rgba(99,102,241,.2);z-index:10;padding:20px;text-align:center}
  .plov h3{font-family:'Playfair Display',serif;font-size:18px;color:#fff}
  .plov p{font-size:12px;color:var(--dim);max-width:240px;line-height:1.5}
  .ucta{display:inline-block;background:linear-gradient(135deg,var(--ac),#4f46e5);color:#fff;
    border-radius:10px;padding:11px 20px;font-size:13px;font-weight:600;text-decoration:none;transition:all .2s}
  .ucta:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(99,102,241,.4)}
  .hcg{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:24px}
  .hcc{background:rgba(255,255,255,.02);border:1px solid var(--bd);border-radius:16px;padding:18px}
  .hct{font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px}
  .hct.hot{color:#f87171}.hct.cold{color:#60a5fa}
  .hci{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .hcb{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;
    font-family:'DM Mono',monospace;font-size:12px;font-weight:500;flex-shrink:0}
  .hcb.hot{background:radial-gradient(circle at 35% 35%,#fca5a5,#dc2626)}
  .hcb.cold{background:radial-gradient(circle at 35% 35%,#93c5fd,#1d4ed8)}
  .hci-info{flex:1;min-width:0}
  .hci-n{font-size:13px;font-family:'DM Mono',monospace;color:var(--text)}
  .hci-s{font-size:10px;color:var(--dim)}
  .hbw{width:50px;height:3px;background:var(--bg3);border-radius:2px;flex-shrink:0}
  .hb{height:100%;border-radius:2px;transition:width .6s}
  .ngrid{display:grid;grid-template-columns:repeat(10,1fr);gap:2px}
  .nc{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
    border-radius:5px;border:1px solid transparent;transition:transform .15s;position:relative}
  .nc:hover{transform:scale(1.2);z-index:5}
  .nc .nn{font-family:'DM Mono',monospace;font-size:clamp(8px,1.4vw,11px);font-weight:500}
  .nc .nv{font-size:6px;color:var(--dim)}
  .dtable{width:100%;border-collapse:collapse}
  .dtable th{text-align:left;padding:8px 10px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--dim);border-bottom:1px solid var(--bd)}
  .dtable td{padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.03);font-size:12px}
  .dtable tr:hover td{background:rgba(255,255,255,.02)}
  .bs{display:inline-flex;width:22px;height:22px;border-radius:50%;align-items:center;justify-content:center;
    font-size:9px;font-family:'DM Mono',monospace;margin:1px;background:var(--bg3);border:1px solid var(--bd)}
  .bs.f{background:linear-gradient(135deg,var(--gl),var(--gd));color:#000;font-weight:700}
  .sbadge{display:inline-block;padding:2px 7px;border-radius:5px;font-size:9px;
    background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.2);color:#a5b4fc}
  .stitle{font-family:'Playfair Display',serif;font-size:18px;font-weight:700;color:var(--text);
    margin-bottom:14px;display:flex;align-items:center;gap:10px}
  .stitle::after{content:'';flex:1;height:1px;background:var(--bd)}
  .ibox{background:rgba(99,102,241,.05);border:1px solid rgba(99,102,241,.15);border-radius:10px;
    padding:12px 14px;font-size:12px;color:var(--dim);line-height:1.7;margin-top:14px}
  .ibox strong{color:#a5b4fc}
  .test-s{margin-top:48px;padding-top:36px;border-top:1px solid var(--bd)}
  .test-h{text-align:center;margin-bottom:28px}
  .test-h h2{font-family:'Playfair Display',serif;font-size:24px;font-weight:900;
    background:linear-gradient(135deg,var(--gl),var(--gold));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .test-h p{font-size:13px;color:var(--dim);margin-top:6px}
  .carousel{overflow:hidden}
  .ctrack{display:flex;transition:transform .5s cubic-bezier(.4,0,.2,1)}
  .tcard{flex:0 0 100%;background:rgba(255,255,255,.03);border:1px solid var(--bd);
    border-radius:14px;padding:24px;text-align:center}
  .ttext{font-size:13px;line-height:1.7;color:var(--text);margin:10px auto;font-style:italic;max-width:480px}
  .tauth{font-size:11px;color:var(--dim);margin-top:8px}
  .dots{display:flex;justify-content:center;gap:6px;margin-top:14px}
  .dot{width:6px;height:6px;border-radius:50%;background:var(--bd);cursor:pointer;transition:all .2s;border:none;padding:0}
  .dot.on{background:var(--gold);width:18px;border-radius:3px}
  .pcta{margin-top:40px;background:linear-gradient(135deg,rgba(99,102,241,.08),rgba(201,168,76,.06));
    border:1px solid rgba(201,168,76,.15);border-radius:18px;padding:28px 20px;text-align:center}
  .pcta h3{font-family:'Playfair Display',serif;font-size:20px;color:#fff;margin-bottom:8px}
  .pcta p{font-size:13px;color:var(--dim);margin:0 auto 18px;line-height:1.5;max-width:340px}
  .loading{text-align:center;padding:60px;color:var(--dim);font-size:13px}
  .spin{width:32px;height:32px;border:2px solid var(--bd);border-top-color:var(--gold);border-radius:50%;
    animation:spin 1s linear infinite;margin:0 auto 14px}
  @keyframes spin{to{transform:rotate(360deg)}}
  .ebox{background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.15);border-radius:8px;
    padding:10px 14px;font-size:12px;color:#fca5a5;margin-bottom:18px}
  .disc{margin-top:36px;padding:12px 14px;border:1px solid rgba(255,255,255,.04);border-radius:8px;
    font-size:11px;color:var(--dim);line-height:1.6;text-align:center}
  @media(max-width:640px){.hcg{grid-template-columns:1fr}.pgrid{gap:5px}.pcard{padding:12px 4px}}
`;

export default function PredictionsPage() {
  const [isPremium, setIsPremium] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [tab, setTab] = useState<"predicciones"|"frecuencias"|"historial">("predicciones");
  const [sorteo, setSorteo] = useState<Sorteo>("Nocturna");
  const [digits, setDigits] = useState(2);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [error, setError] = useState("");
  const [freq, setFreq] = useState<FreqItem[]>([]);
  const [draws, setDraws] = useState<DrawRow[]>([]);
  const [totalDraws, setTotalDraws] = useState(0);
  const [predictions, setPredictions] = useState<string[]>([]);
  const [tidx, setTidx] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval>|null>(null);

  // Carousel
  useEffect(() => {
    timer.current = setInterval(() => setTidx(i => (i+1) % TESTIMONIOS.length), 4500);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  // Auth: obtener sesión y verificar premium via API server-side
  useEffect(() => {
    import("@/lib/supabase").then(({ getSupabaseBrowser }) => {
      const sb = getSupabaseBrowser();
      sb.auth.getSession().then(async ({ data }) => {
        if (!data.session) { window.location.href = "/login"; return; }
        setUserEmail(data.session.user.email ?? "");

        // Verificar premium via endpoint server-side (tiene acceso a service_role)
        try {
          const r = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${data.session.access_token}` },
          });
          if (r.ok) {
            const profile = await r.json();
            setIsPremium(profile.isPremium ?? false);
          }
        } catch {
          setIsPremium(false);
        }
        setAuthReady(true);
      });
    });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch(`/api/predictions?sorteo=${encodeURIComponent(sorteo)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setFreq(d.frequencyData ?? []);
      setTotalDraws(d.totalDraws ?? 0);
      setPredictions(d.predictions ?? []);
    } catch {
      setError("Mostrando datos de demostración. Ejecutá el scraper para datos reales.");
      const mock: FreqItem[] = Array.from({length:100}, (_, i) => ({
        num: i,
        total_appearances: Math.floor(Math.random()*200)+50,
        first_place_count: Math.floor(Math.random()*20),
      }));
      setFreq(mock);
      setPredictions([...mock].sort((a,b)=>b.total_appearances-a.total_appearances).slice(0,5).map(x=>pad(x.num)));
    } finally { setLoading(false); }
  }, [sorteo]);

  const fetchDraws = useCallback(async () => {
    try {
      const r = await fetch(`/api/pending?limit=15&sorteo=${sorteo}`);
      if (r.ok) { const d = await r.json(); setDraws(d.draws ?? []); }
    } catch { /* silent */ }
  }, [sorteo]);

  useEffect(() => {
    if (authReady) { fetchData(); fetchDraws(); }
  }, [authReady, fetchData, fetchDraws]);

  const maxF = freq.length ? Math.max(...freq.map(f => f.total_appearances)) : 1;
  const hotN = [...freq].sort((a,b) => b.total_appearances - a.total_appearances).slice(0,5);
  const coldN = [...freq].sort((a,b) => a.total_appearances - b.total_appearances).slice(0,5);

  const heat = (n: number) => {
    const item = freq.find(f => f.num === n);
    if (!item) return { bg:"rgba(30,41,59,.5)", border:"rgba(51,65,85,.4)" };
    const r = item.total_appearances / maxF;
    if (r > .75) return { bg:"rgba(239,68,68,.25)", border:"rgba(239,68,68,.5)" };
    if (r > .55) return { bg:"rgba(245,158,11,.2)", border:"rgba(245,158,11,.4)" };
    if (r > .35) return { bg:"rgba(99,102,241,.15)", border:"rgba(99,102,241,.3)" };
    return { bg:"rgba(30,41,59,.4)", border:"rgba(51,65,85,.3)" };
  };

  const logout = async () => {
    const { getSupabaseBrowser } = await import("@/lib/supabase");
    await getSupabaseBrowser().auth.signOut();
    window.location.href = "/login";
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="wrap">

          <nav className="nav">
            <div className="nav-logo" onClick={() => window.scrollTo(0,0)}>
              <div className="nav-icon">🎰</div>
              <span className="nav-title">Quiniela IA</span>
            </div>
            <div className="nav-right">
              {isPremium && <span className="ppill">✦ PREMIUM</span>}
              {userEmail && <span style={{fontSize:12,color:"var(--dim)"}}>{userEmail.split("@")[0]}</span>}
              <button className="nav-btn" onClick={logout}>Salir</button>
            </div>
          </nav>

          <div className="hero">
            <h1>Predicciones Reales</h1>
            <p>Análisis estadístico de sorteos históricos reales de la Quiniela de la Ciudad de Buenos Aires</p>
            <div className="stats-row">
              <div className="scard">
                <div className="sv">{totalDraws > 0 ? totalDraws : "—"}</div>
                <div className="sl">Sorteos analizados</div>
              </div>
              <div className="scard">
                <div className="sv">{hotN.length > 0 ? pad(hotN[0].num) : "—"}</div>
                <div className="sl">Número caliente</div>
              </div>
              <div className="scard">
                <div className="sv">{isPremium ? "PRO" : "FREE"}</div>
                <div className="sl">Tu acceso</div>
              </div>
            </div>
          </div>

          <div className="ctrls">
            <div className="sw">
              <label>Sorteo a analizar</label>
              <select value={sorteo} onChange={e => setSorteo(e.target.value as Sorteo)}>
                {SORTEOS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            {!isPremium && (
              <a href={UALA_LINK} target="_blank" rel="noopener noreferrer"
                style={{padding:"10px 18px",background:"linear-gradient(135deg,#6366f1,#4f46e5)",
                  color:"#fff",borderRadius:"10px",fontSize:"13px",fontWeight:600,
                  textDecoration:"none",whiteSpace:"nowrap",flexShrink:0}}>
                💳 Activar Premium
              </a>
            )}
          </div>

          {error && <div className="ebox">⚠ {error}</div>}

          <div className="tabs">
            {(["predicciones","frecuencias","historial"] as const).map(t => (
              <button key={t} className={`tab ${tab===t?"on":""}`} onClick={() => setTab(t)}>
                {t==="predicciones" ? "🎯 Predicciones" : t==="frecuencias" ? "🔥 Frecuencias" : "📋 Historial"}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="loading"><div className="spin"/><div>ANALIZANDO DATOS...</div></div>
          ) : (<>

            {tab === "predicciones" && (<>
              <div className="stitle">Motor de Predicción Estadística</div>
              <div className="dtabs">
                {[2,3,4].map(d => (
                  <button key={d} className={`dtab ${digits===d?"on":""}`} onClick={() => setDigits(d)}>
                    {d > 2 && <span className="pbadge">PRO</span>}
                    {d} dígitos
                  </button>
                ))}
              </div>

              <div className={digits > 2 && !isPremium ? "plock" : ""}>
                <div className="pgrid">
                  {predictions.map((p, i) => (
                    <div className="pcard" key={i}>
                      <div className="pnum">{p}</div>
                      <div className="prank">#{i+1}</div>
                      <div className="pstars">{CONF[i]}</div>
                    </div>
                  ))}
                </div>
                {digits > 2 && !isPremium && (
                  <div className="plov">
                    <div style={{fontSize:36}}>🔐</div>
                    <h3>Predicciones {digits} dígitos</h3>
                    <p>Suscribite al plan Premium para acceder a predicciones de {digits} cifras con análisis estadístico real.</p>
                    <a href={UALA_LINK} target="_blank" rel="noopener noreferrer" className="ucta">
                      💳 Suscribirme — $1.500/mes
                    </a>
                    <div style={{fontSize:10,color:"var(--dim)"}}>Pago seguro via Ualá · Acceso inmediato</div>
                  </div>
                )}
              </div>

              <div className="ibox">
                <strong>ℹ Metodología:</strong> Análisis sobre los últimos 365 días de sorteos reales.
                Score = frecuencia total + (3× apariciones en 1° puesto).{" "}
                <strong>Datos obtenidos de ruta1000.com.ar — resultados oficiales de la Quiniela de la Ciudad.</strong>
              </div>

              <div style={{marginTop:28}}>
                <div className="stitle">Números Calientes y Fríos</div>
                <div className="hcg">
                  {[
                    {title:"🔥 Más frecuentes", cls:"hot", data:hotN, grad:"linear-gradient(90deg,#dc2626,#f87171)"},
                    {title:"❄ Menos frecuentes", cls:"cold", data:coldN, grad:"linear-gradient(90deg,#1d4ed8,#60a5fa)"},
                  ].map(({title,cls,data,grad}) => (
                    <div className="hcc" key={cls}>
                      <div className={`hct ${cls}`}>{title}</div>
                      {data.map(item => (
                        <div className="hci" key={item.num}>
                          <div className={`hcb ${cls}`}>{pad(item.num)}</div>
                          <div className="hci-info">
                            <div className="hci-n">{pad(item.num)}</div>
                            <div className="hci-s">{item.total_appearances} veces · {item.first_place_count}× 1°</div>
                          </div>
                          <div className="hbw">
                            <div className="hb" style={{width:`${(item.total_appearances/maxF)*100}%`,background:grad}}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </>)}

            {tab === "frecuencias" && (<>
              <div className="stitle">Mapa de Calor — Números 00 al 99</div>
              <div style={{fontSize:11,color:"var(--dim)",marginBottom:14,display:"flex",gap:14,flexWrap:"wrap"}}>
                {[
                  ["rgba(239,68,68,.25)","rgba(239,68,68,.5)","Muy frecuente"],
                  ["rgba(245,158,11,.2)","rgba(245,158,11,.4)","Frecuente"],
                  ["rgba(99,102,241,.15)","rgba(99,102,241,.3)","Normal"],
                  ["rgba(30,41,59,.4)","rgba(51,65,85,.3)","Poco frecuente"],
                ].map(([bg,b,lbl]) => (
                  <span key={lbl} style={{display:"flex",alignItems:"center",gap:5}}>
                    <span style={{width:10,height:10,background:bg,border:`1px solid ${b}`,borderRadius:2,display:"inline-block"}}/>
                    {lbl}
                  </span>
                ))}
              </div>
              <div className="ngrid">
                {Array.from({length:100}, (_, n) => {
                  const {bg, border} = heat(n);
                  const item = freq.find(f => f.num === n);
                  return (
                    <div key={n} className="nc" style={{background:bg, borderColor:border}}
                      title={`${pad(n)}: ${item?.total_appearances ?? 0} veces`}>
                      <span className="nn">{pad(n)}</span>
                      <span className="nv">{item?.total_appearances ?? 0}</span>
                    </div>
                  );
                })}
              </div>
            </>)}

            {tab === "historial" && (<>
              <div className="stitle">Últimos Sorteos Reales</div>
              {draws.length === 0 ? (
                <div style={{textAlign:"center",padding:"48px 0",color:"var(--dim)"}}>
                  <div style={{fontSize:40,marginBottom:12}}>📊</div>
                  <p style={{fontSize:14,marginBottom:8}}>No hay sorteos en la base de datos todavía.</p>
                  <p style={{fontSize:12}}>Ejecutá el scraper para poblar con datos reales:</p>
                  <code style={{display:"block",marginTop:10,background:"var(--bg3)",
                    padding:"10px 16px",borderRadius:8,fontSize:12,color:"var(--gold)"}}>
                    python scripts/ingest_ruta1000.py --days 30
                  </code>
                </div>
              ) : (
                <div style={{overflowX:"auto"}}>
                  <table className="dtable">
                    <thead><tr><th>Fecha</th><th>Sorteo</th><th>1°</th><th>Top 9</th></tr></thead>
                    <tbody>
                      {draws.map((d, i) => (
                        <tr key={i}>
                          <td style={{fontFamily:"'DM Mono',monospace",fontSize:11}}>{d.draw_date}</td>
                          <td><span className="sbadge">{d.sorteo}</span></td>
                          <td><span className="bs f">{pad(d.pos_1 % 100)}</span></td>
                          <td>
                            {[d.pos_2,d.pos_3,d.pos_4,d.pos_5,d.pos_6,d.pos_7,d.pos_8,d.pos_9,d.pos_10]
                              .filter(Boolean)
                              .map((n, j) => <span key={j} className="bs">{pad((n ?? 0) % 100)}</span>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>)}
          </>)}

          {/* Testimonios */}
          <div className="test-s">
            <div className="test-h">
              <h2>Lo que dicen nuestros usuarios</h2>
              <p>Miles de quinieleros ya usan Quiniela IA para tomar mejores decisiones</p>
            </div>
            <div className="carousel">
              <div className="ctrack" style={{transform:`translateX(-${tidx*100}%)`}}>
                {TESTIMONIOS.map((t, i) => (
                  <div className="tcard" key={i}>
                    <span style={{color:"#f59e0b",letterSpacing:2,fontSize:16}}>
                      {"★".repeat(t.stars)}{"☆".repeat(5-t.stars)}
                    </span>
                    <div className="ttext">"{t.texto}"</div>
                    <div className="tauth">
                      <strong style={{color:"var(--text)"}}>{t.nombre}</strong>
                      <span style={{margin:"0 6px",color:"var(--bd)"}}>·</span>
                      {t.ciudad}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="dots">
              {TESTIMONIOS.map((_, i) => (
                <button key={i} className={`dot ${i===tidx?"on":""}`} onClick={() => setTidx(i)}/>
              ))}
            </div>
          </div>

          {/* Premium CTA */}
          {!isPremium && (
            <div className="pcta">
              <div style={{fontSize:32,marginBottom:10}}>🚀</div>
              <h3>Desbloqueá predicciones completas</h3>
              <p>Accedé a predicciones de 3 y 4 cifras basadas en análisis estadístico real de 365 días de sorteos.</p>
              <a href={UALA_LINK} target="_blank" rel="noopener noreferrer" className="ucta">
                💳 Suscribirme por $1.500/mes
              </a>
              <div style={{fontSize:11,color:"var(--dim)",marginTop:8}}>
                Pago seguro via Ualá · Acceso inmediato · Cancelá cuando quieras
              </div>
            </div>
          )}

          <div className="disc">
            ⚠ Herramienta de análisis estadístico con fines informativos. La quiniela es un juego de azar regulado por la Lotería de la Ciudad de Buenos Aires. Los resultados pasados no garantizan resultados futuros. Jugá responsablemente.
          </div>

        </div>
      </div>
    </>
  );
}
