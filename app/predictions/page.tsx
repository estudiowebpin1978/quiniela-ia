"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { KINO } from "@/lib/kino";

const UALA = "https://pagar.ualabis.com.ar/order/df50920d5961bd85d19f4231747cc5d7e6ca0489da6e76a4";
const CONTACT = "estudiowebpin@gmail.com";
const SORTEOS = ["Todos","Previa","Primera","Matutina","Vespertina","Nocturna"] as const;
type Sorteo = typeof SORTEOS[number];

interface Pred { num:string; kino:string; totalCount:number; firstCount:number; }
interface Rdbl { num:string; kino:string; count:number; }
interface FreqItem { num:number; total_appearances:number; first_place_count:number; }
interface Draw { draw_date:string; sorteo:string; pos_1:number; [k:string]:string|number; }

const TESTIMONIOS = [
  {n:"Carlos M.",c:"Buenos Aires",t:"Llevo 3 meses usando Quiniela IA y mis aciertos mejoraron notablemente. El análisis estadístico me ayuda a elegir mejor cada día.",s:5},
  {n:"Laura G.",c:"Rosario",t:"Me sorprendió la precisión del sistema. Los números calientes que sugiere realmente salen con más frecuencia en los sorteos.",s:5},
  {n:"Roberto P.",c:"Córdoba",t:"La suscripción premium vale cada peso. La redoblona y las predicciones de 4 cifras son increíbles.",s:5},
  {n:"Marcela S.",c:"Mendoza",t:"Fácil de usar, información clara y actualizada. Ya no elijo números al azar, confío en el análisis estadístico.",s:4},
  {n:"Diego F.",c:"Mar del Plata",t:"El mapa de calor y la redoblona son herramientas muy útiles. Mejoraron mucho mis resultados.",s:5},
];

const pad = (n:number, l=2) => String(n).padStart(l,"0");

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600;700&family=DM+Mono&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{--g:#c9a84c;--gl:#f0cc6e;--gd:#7a6430;--bg:#06080f;--bg3:#161b22;--bd:rgba(255,255,255,.07);--t:#e2e8f0;--dim:#64748b;--ac:#6366f1}
body{background:var(--bg);color:var(--t);font-family:'DM Sans',sans-serif;min-height:100vh}
.app{min-height:100vh;background:radial-gradient(ellipse 90% 50% at 50% -15%,rgba(99,102,241,.1),transparent 55%),var(--bg)}
.nav{position:sticky;top:0;z-index:100;background:rgba(6,8,15,.94);backdrop-filter:blur(24px);border-bottom:1px solid var(--bd);padding:12px 20px;display:flex;align-items:center;justify-content:space-between}
.nav-l{display:flex;align-items:center;gap:10px;cursor:pointer}
.nav-ico{width:34px;height:34px;background:linear-gradient(135deg,var(--g),var(--gd));border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:17px}
.nav-name{font-family:'Playfair Display',serif;font-size:18px;font-weight:900;background:linear-gradient(135deg,var(--gl),var(--g));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.nav-r{display:flex;align-items:center;gap:8px}
.ppill{background:rgba(201,168,76,.14);border:1px solid rgba(201,168,76,.28);color:var(--g);font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px}
.nav-email{font-size:11px;color:var(--dim);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nav-out{padding:6px 12px;border-radius:8px;border:1px solid var(--bd);background:transparent;color:var(--dim);font-size:12px;cursor:pointer;font-family:inherit;transition:.2s}
.nav-out:hover{border-color:var(--g);color:var(--g)}
.wrap{max-width:860px;margin:0 auto;padding:28px 16px 80px}
.hero{text-align:center;padding:8px 0 28px}
.hero h1{font-family:'Playfair Display',serif;font-size:clamp(26px,6vw,52px);font-weight:900;background:linear-gradient(135deg,var(--gl),var(--g),var(--gd));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px;line-height:1.05}
.hero p{color:var(--dim);font-size:13px;max-width:360px;margin:0 auto 22px;line-height:1.6}
.stat-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:420px;margin:0 auto}
.sc{background:rgba(255,255,255,.03);border:1px solid var(--bd);border-radius:12px;padding:12px 6px;text-align:center}
.sv{font-family:'Playfair Display',serif;font-size:22px;color:var(--g);font-weight:700}
.sl{font-size:10px;color:var(--dim);margin-top:2px}
.ctrls{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:20px}
.sw{flex:1;min-width:140px}
.sw label{display:block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--dim);margin-bottom:5px}
select{width:100%;background:var(--bg3);border:1px solid var(--bd);border-radius:10px;color:var(--t);font-size:13px;padding:10px 13px;outline:none;cursor:pointer;font-family:inherit}
select:focus{border-color:rgba(201,168,76,.4)}
.gen-btn{flex-shrink:0;padding:11px 20px;background:linear-gradient(135deg,var(--g),var(--gd));color:#000;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:.2s;display:flex;align-items:center;gap:6px}
.gen-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 20px rgba(201,168,76,.4)}
.gen-btn:disabled{opacity:.5;cursor:not-allowed}
.act-btn{flex-shrink:0;padding:11px 16px;background:linear-gradient(135deg,var(--ac),#4f46e5);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;font-family:inherit;transition:.2s}
.act-btn:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(99,102,241,.35)}
.stabs{display:flex;background:rgba(255,255,255,.03);border-radius:12px;padding:3px;margin-bottom:22px;gap:2px;overflow-x:auto}
.stab{flex:1;min-width:70px;padding:8px 6px;text-align:center;border-radius:8px;border:none;background:transparent;color:var(--dim);font-size:11px;font-weight:500;cursor:pointer;white-space:nowrap;font-family:inherit;transition:.2s}
.stab.on{background:rgba(201,168,76,.11);color:var(--g);border:1px solid rgba(201,168,76,.22)}
.dtabs{display:flex;gap:6px;margin-bottom:16px}
.dtab{flex:1;padding:9px 4px;text-align:center;border:1px solid var(--bd);border-radius:10px;background:transparent;color:var(--dim);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;transition:.2s;position:relative}
.dtab.on{border-color:rgba(201,168,76,.4);color:var(--g);background:rgba(201,168,76,.07)}
.pbadge{position:absolute;top:-8px;right:4px;background:var(--g);color:#000;font-size:8px;font-weight:700;padding:2px 5px;border-radius:10px}
.pgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px}
.pcard{background:rgba(255,255,255,.03);border:1px solid var(--bd);border-radius:14px;padding:16px 6px 12px;text-align:center;transition:.2s}
.pcard:hover{border-color:rgba(201,168,76,.3);transform:translateY(-2px);background:rgba(201,168,76,.04)}
.pnum{font-family:'Playfair Display',serif;font-size:clamp(22px,4vw,36px);font-weight:900;background:linear-gradient(135deg,var(--gl),var(--g));-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1}
.pkino{font-size:9px;color:var(--g);margin-top:4px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 3px}
.prank{font-size:9px;color:var(--dim);margin-top:3px}
.pstars{font-size:9px;color:var(--g);margin-top:1px}
.pstats{font-size:8px;color:var(--dim);margin-top:2px}
.plock{position:relative}
.plov{position:absolute;inset:0;background:rgba(6,8,15,.93);backdrop-filter:blur(10px);border-radius:12px;border:1px solid rgba(99,102,241,.2);z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;text-align:center}
.plov h3{font-family:'Playfair Display',serif;font-size:16px;color:#fff}
.plov p{font-size:11px;color:var(--dim);max-width:200px;line-height:1.5}
.ucta{display:inline-block;background:linear-gradient(135deg,var(--ac),#4f46e5);color:#fff;border-radius:10px;padding:9px 16px;font-size:12px;font-weight:600;text-decoration:none;transition:.2s}
.ucta:hover{transform:translateY(-1px)}
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
.rdbl{background:rgba(245,158,11,.04);border:1px solid rgba(245,158,11,.18);border-radius:14px;padding:18px}
.rdbl-h{font-family:'Playfair Display',serif;font-size:15px;color:#fbbf24;margin-bottom:5px}
.rdbl-sub{font-size:11px;color:var(--dim);margin-bottom:14px;line-height:1.5}
.rdbl-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}
.rc{background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.18);border-radius:11px;padding:12px 4px;text-align:center;transition:.2s}
.rc:hover{border-color:rgba(245,158,11,.5);transform:translateY(-2px)}
.rc-n{font-family:'Playfair Display',serif;font-size:24px;font-weight:900;color:#fbbf24}
.rc-k{font-size:9px;color:#fbbf24;opacity:.7;margin-top:2px}
.rc-c{font-size:9px;color:var(--dim);margin-top:2px}
.ngrid{display:grid;grid-template-columns:repeat(10,1fr);gap:2px}
.nc{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:5px;border:1px solid transparent;cursor:default;transition:transform .15s}
.nc:hover{transform:scale(1.25);z-index:5}
.nn{font-family:'DM Mono',monospace;font-size:clamp(7px,1.2vw,11px);font-weight:500}
.nv{font-size:6px;color:var(--dim)}
.dtable{width:100%;border-collapse:collapse}
.dtable th{text-align:left;padding:7px 10px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--dim);border-bottom:1px solid var(--bd)}
.dtable td{padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.03);font-size:11px}
.dtable tr:hover td{background:rgba(255,255,255,.02)}
.bs{display:inline-flex;width:22px;height:22px;border-radius:50%;align-items:center;justify-content:center;font-size:9px;font-family:'DM Mono',monospace;margin:1px;background:var(--bg3);border:1px solid var(--bd)}
.bs.f{background:linear-gradient(135deg,var(--gl),var(--gd));color:#000;font-weight:700}
.sbadge{display:inline-block;padding:2px 6px;border-radius:5px;font-size:9px;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.2);color:#a5b4fc}
.ibox{background:rgba(99,102,241,.05);border:1px solid rgba(99,102,241,.14);border-radius:9px;padding:10px 12px;font-size:11px;color:var(--dim);line-height:1.7;margin-top:12px}
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
.ttxt{font-size:13px;line-height:1.7;color:var(--t);margin:8px auto;font-style:italic;max-width:480px}
.taut{font-size:11px;color:var(--dim);margin-top:6px}
.dots{display:flex;justify-content:center;gap:5px;margin-top:10px}
.dot{width:6px;height:6px;border-radius:50%;background:var(--bd);cursor:pointer;transition:all .3s;border:none;padding:0}
.dot.on{background:var(--g);width:18px;border-radius:3px}
.pcta{margin-top:32px;background:linear-gradient(135deg,rgba(99,102,241,.07),rgba(201,168,76,.05));border:1px solid rgba(201,168,76,.14);border-radius:16px;padding:24px 16px;text-align:center}
.pcta h3{font-family:'Playfair Display',serif;font-size:18px;color:#fff;margin-bottom:5px}
.pcta p{font-size:12px;color:var(--dim);max-width:300px;margin:0 auto 14px;line-height:1.5}
.footer{margin-top:36px;padding-top:20px;border-top:1px solid var(--bd);text-align:center}
.footer p{font-size:11px;color:var(--dim);line-height:1.7}
.footer a{color:var(--g);text-decoration:none}
.footer a:hover{text-decoration:underline}
.spin{width:26px;height:26px;border:2px solid var(--bd);border-top-color:var(--g);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 10px}
@keyframes spin{to{transform:rotate(360deg)}}
.loading{text-align:center;padding:50px 20px;color:var(--dim);font-size:13px}
.ebox{background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.15);border-radius:8px;padding:10px 13px;font-size:11px;color:#fca5a5;margin-bottom:14px}
.disc{margin-top:20px;padding:10px 14px;border:1px solid var(--bd);border-radius:8px;font-size:10px;color:var(--dim);line-height:1.5;text-align:center;opacity:.7}
.gen-hint{font-size:11px;color:var(--dim);margin-top:8px;text-align:center}
@media(max-width:600px){.hcg{grid-template-columns:1fr}.pgrid{gap:4px}.pcard{padding:10px 3px 8px}.rdbl-grid{gap:4px}}
`;

export default function PredictionsPage() {
  const [isPremium, setIsPremium] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [section, setSection] = useState<"pred"|"rdbl"|"freq"|"hist">("pred");
  const [sorteo, setSorteo] = useState<Sorteo>("Nocturna");
  const [digits, setDigits] = useState(2);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [apiErr, setApiErr] = useState("");
  const [freq, setFreq] = useState<FreqItem[]>([]);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [totalDraws, setTotalDraws] = useState(0);
  const [preds2, setPreds2] = useState<Pred[]>([]);
  const [preds3, setPreds3] = useState<Pred[]>([]);
  const [preds4, setPreds4] = useState<Pred[]>([]);
  const [rdbl, setRdbl] = useState<Rdbl[]>([]);
  const [tidx, setTidx] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval>|null>(null);

  // Carousel - lento (8 segundos)
  useEffect(() => {
    timer.current = setInterval(() => setTidx(i => (i+1) % TESTIMONIOS.length), 8000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  // Auth check via localStorage
  useEffect(() => {
    const raw = localStorage.getItem("sb-wazkylxgqckjfkcmfotl-auth-token");
    if (!raw) { window.location.href = "/login"; return; }
    try {
      const session = JSON.parse(raw);
      if (!session?.access_token) { window.location.href = "/login"; return; }
      const now = Math.floor(Date.now()/1000);
      if (session.expires_at && session.expires_at < now) {
        localStorage.removeItem("sb-wazkylxgqckjfkcmfotl-auth-token");
        window.location.href = "/login"; return;
      }
      setUserEmail(session.user?.email ?? "");
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${session.access_token}` }})
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.isPremium) setIsPremium(true); })
        .catch(() => {});
    } catch { window.location.href = "/login"; }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true); setApiErr(""); setGenerated(false);
    try {
      const r = await fetch(`/api/predictions?sorteo=${encodeURIComponent(sorteo)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);

      const f: FreqItem[] = d.frequencyData ?? [];
      setFreq(f);
      setTotalDraws(d.totalDraws ?? 0);

      const mkPreds = (nums: string[]) => nums.map(n => {
        const t = parseInt(n.slice(-2), 10);
        const fi = f.find(x => x.num === t);
        return { num: n, kino: KINO[t] ?? "", totalCount: fi?.total_appearances ?? 0, firstCount: fi?.first_place_count ?? 0 };
      });

      setPreds2(mkPreds(d.predictions ?? []));
      setPreds3(mkPreds(d.predictions3d ?? []));
      setPreds4(mkPreds(d.predictions4d ?? []));
      setRdbl((d.redoblona ?? []).map((x:{num:string;redoblonaCount:number}) => ({
        num: x.num, kino: KINO[parseInt(x.num)] ?? "", count: x.redoblonaCount,
      })));
      setGenerated(true);
    } catch(e: unknown) {
      setApiErr((e as Error)?.message ?? String(e));
    } finally { setLoading(false); }
  }, [sorteo]);

  const fetchDraws = useCallback(async () => {
    try {
      const r = await fetch(`/api/pending?limit=20&sorteo=${sorteo}`);
      if (r.ok) { const d = await r.json(); setDraws(d.draws ?? []); }
    } catch { /**/ }
  }, [sorteo]);

  useEffect(() => {
    if (section === "hist") fetchDraws();
  }, [section, fetchDraws]);

  const logout = () => {
    localStorage.removeItem("sb-wazkylxgqckjfkcmfotl-auth-token");
    window.location.href = "/login";
  };

  const maxF = freq.length ? Math.max(...freq.map(f=>f.total_appearances), 1) : 1;
  const hot5 = [...freq].sort((a,b)=>b.total_appearances-a.total_appearances).slice(0,5);
  const cold5 = [...freq].sort((a,b)=>a.total_appearances-b.total_appearances).slice(0,5);

  const heatColor = (n:number) => {
    const item = freq.find(f=>f.num===n);
    if (!item) return {bg:"rgba(20,27,42,.6)",bd:"rgba(51,65,85,.4)"};
    const r = item.total_appearances / maxF;
    if (r>.75) return {bg:"rgba(239,68,68,.28)",bd:"rgba(239,68,68,.6)"};
    if (r>.55) return {bg:"rgba(245,158,11,.22)",bd:"rgba(245,158,11,.5)"};
    if (r>.35) return {bg:"rgba(99,102,241,.18)",bd:"rgba(99,102,241,.4)"};
    return {bg:"rgba(20,27,42,.5)",bd:"rgba(51,65,85,.3)"};
  };

  const curPreds = digits===2 ? preds2 : digits===3 ? preds3 : preds4;

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <nav className="nav">
          <div className="nav-l" onClick={()=>window.scrollTo(0,0)}>
            <div className="nav-ico">🎰</div>
            <span className="nav-name">Quiniela IA</span>
          </div>
          <div className="nav-r">
            {isPremium && <span className="ppill">✦ PREMIUM</span>}
            {userEmail && <span className="nav-email">{userEmail.split("@")[0]}</span>}
            <button className="nav-out" onClick={logout}>Salir</button>
          </div>
        </nav>

        <div className="wrap">
          <div className="hero">
            <h1>Predicciones Inteligentes</h1>
            <p>Análisis estadístico real de la Quiniela de la Ciudad de Buenos Aires — datos de sorteos históricos actualizados.</p>
            <div className="stat-row">
              <div className="sc"><div className="sv">{totalDraws||"—"}</div><div className="sl">Sorteos analizados</div></div>
              <div className="sc"><div className="sv">{hot5[0]?pad(hot5[0].num):"—"}</div><div className="sl">Número caliente</div></div>
              <div className="sc"><div className="sv">{isPremium?"PRO":"FREE"}</div><div className="sl">Tu acceso</div></div>
            </div>
          </div>

          {/* CONTROLES + BOTÓN GENERAR */}
          <div className="ctrls">
            <div className="sw">
              <label>Sorteo</label>
              <select value={sorteo} onChange={e=>setSorteo(e.target.value as Sorteo)}>
                {SORTEOS.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <button className="gen-btn" onClick={fetchData} disabled={loading}>
              {loading ? "⏳ Analizando..." : "🎯 Generar Predicción"}
            </button>
            {!isPremium && (
              <a href={UALA} target="_blank" rel="noopener noreferrer" className="act-btn">
                💳 Premium
              </a>
            )}
          </div>

          {!generated && !loading && (
            <div className="gen-hint">
              👆 Seleccioná un sorteo y apretá <strong style={{color:"var(--g)"}}>Generar Predicción</strong> para ver el análisis
            </div>
          )}

          {apiErr && <div className="ebox">⚠ {apiErr}</div>}

          {generated && (<>
            <div className="stabs">
              <button className={`stab ${section==="pred"?"on":""}`} onClick={()=>setSection("pred")}>🎯 Predicciones</button>
              <button className={`stab ${section==="rdbl"?"on":""}`} onClick={()=>setSection("rdbl")}>🔄 Redoblona</button>
              <button className={`stab ${section==="freq"?"on":""}`} onClick={()=>setSection("freq")}>🔥 Frecuencias</button>
              <button className={`stab ${section==="hist"?"on":""}`} onClick={()=>{setSection("hist");fetchDraws();}}>📋 Historial</button>
            </div>

            {/* PREDICCIONES */}
            {section==="pred" && (<>
              <div className="stit">Análisis Estadístico Real</div>
              <div className="dtabs">
                {[2,3,4].map(d=>(
                  <button key={d} className={`dtab ${digits===d?"on":""}`} onClick={()=>setDigits(d)}>
                    {d>2&&<span className="pbadge">PRO</span>}
                    {d} dígitos
                  </button>
                ))}
              </div>
              <div className={digits>2&&!isPremium?"plock":""}>
                <div className="pgrid">
                  {curPreds.map((p,i)=>(
                    <div className="pcard" key={i}>
                      <div className="pnum">{p.num}</div>
                      <div className="pkino">{p.kino}</div>
                      <div className="prank">#{i+1}</div>
                      <div className="pstars">{"★".repeat(5-i)}{"☆".repeat(i)}</div>
                      <div className="pstats">{p.totalCount}× · {p.firstCount}× 1°</div>
                    </div>
                  ))}
                </div>
                {digits>2&&!isPremium&&(
                  <div className="plov">
                    <div style={{fontSize:34}}>🔐</div>
                    <h3>Predicciones {digits} dígitos</h3>
                    <p>Suscribite al plan Premium para acceder a predicciones de {digits} cifras.</p>
                    <a href={UALA} target="_blank" rel="noopener noreferrer" className="ucta">💳 Suscribirme — $10.000/mes</a>
                  </div>
                )}
              </div>
              <div className="ibox">
                <strong>ℹ Metodología real:</strong> Se analizan los últimos 365 días de sorteos reales de la Quiniela de la Ciudad (fuente: ruta1000.com.ar). Score = frecuencia total + (3× apariciones en 1° puesto). <strong>No es IA generativa</strong> — son cálculos estadísticos puros sobre datos históricos oficiales.
              </div>
              <div style={{marginTop:20}}>
                <div className="stit">Números Calientes y Fríos</div>
                <div className="hcg">
                  {[
                    {title:"🔥 Más frecuentes",cls:"hot",data:hot5,grad:"linear-gradient(90deg,#dc2626,#f87171)"},
                    {title:"❄️ Menos frecuentes",cls:"cold",data:cold5,grad:"linear-gradient(90deg,#1d4ed8,#60a5fa)"},
                  ].map(({title,cls,data,grad})=>(
                    <div className="hcc" key={cls}>
                      <div className={`hct ${cls}`}>{title}</div>
                      {data.map(item=>(
                        <div className="hci" key={item.num}>
                          <div className={`hcb ${cls}`}>{pad(item.num)}</div>
                          <div className="hci-r">
                            <div className="hci-n">{pad(item.num)}</div>
                            <div className="hci-k">{KINO[item.num]}</div>
                            <div className="hci-s">{item.total_appearances}× · {item.first_place_count}× 1°</div>
                          </div>
                          <div className="hbar"><div className="hbar-f" style={{width:`${(item.total_appearances/maxF)*100}%`,background:grad}}/></div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </>)}

            {/* REDOBLONA */}
            {section==="rdbl" && (<>
              <div className="stit">Análisis de Redoblona</div>
              <div className={!isPremium?"plock":""}>
                <div className="rdbl">
                  <div className="rdbl-h">🔄 Números con mayor probabilidad de Redoblona</div>
                  <div className="rdbl-sub">La <strong style={{color:"#fbbf24"}}>redoblona</strong> ocurre cuando el mismo número aparece en dos o más posiciones del mismo sorteo. Paga significativamente más que una apuesta simple.</div>
                  {rdbl.length>0 ? (
                    <div className="rdbl-grid">
                      {rdbl.map((r,i)=>(
                        <div className="rc" key={i}>
                          <div className="rc-n">{r.num}</div>
                          <div className="rc-k">{r.kino}</div>
                          <div className="rc-c">{r.count}× redoblona</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{textAlign:"center",padding:"20px 0",color:"var(--dim)",fontSize:12}}>Sin datos suficientes aún.</div>
                  )}
                </div>
                {!isPremium&&(
                  <div className="plov" style={{position:"relative",inset:"auto",marginTop:12,padding:20,background:"rgba(6,8,15,.92)",backdropFilter:"blur(8px)",borderRadius:14,border:"1px solid rgba(99,102,241,.2)",display:"flex",flexDirection:"column",alignItems:"center",gap:10,textAlign:"center"}}>
                    <div style={{fontSize:30}}>🔐</div>
                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,color:"#fff"}}>Redoblona Premium</div>
                    <div style={{fontSize:11,color:"var(--dim)",maxWidth:240,lineHeight:1.5}}>Accedé al análisis completo con 365 días de datos reales.</div>
                    <a href={UALA} target="_blank" rel="noopener noreferrer" className="ucta">💳 Activar Premium — $10.000/mes</a>
                  </div>
                )}
              </div>
            </>)}

            {/* FRECUENCIAS */}
            {section==="freq" && (<>
              <div className="stit">Mapa de Calor 00–99</div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:10,fontSize:10,color:"var(--dim)"}}>
                {[["rgba(239,68,68,.28)","rgba(239,68,68,.6)","Muy frecuente"],["rgba(245,158,11,.22)","rgba(245,158,11,.5)","Frecuente"],["rgba(99,102,241,.18)","rgba(99,102,241,.4)","Normal"],["rgba(20,27,42,.5)","rgba(51,65,85,.3)","Poco frecuente"]].map(([bg,bd,lbl])=>(
                  <span key={lbl} style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{width:9,height:9,background:bg,border:`1px solid ${bd}`,borderRadius:2,display:"inline-block"}}/>
                    {lbl}
                  </span>
                ))}
              </div>
              <div className="ngrid">
                {Array.from({length:100},(_,n)=>{
                  const {bg,bd}=heatColor(n);
                  const item=freq.find(f=>f.num===n);
                  return (
                    <div key={n} className="nc" style={{background:bg,borderColor:bd}} title={`${pad(n)} — ${KINO[n]} — ${item?.total_appearances??0}×`}>
                      <span className="nn">{pad(n)}</span>
                      <span className="nv">{item?.total_appearances??0}</span>
                    </div>
                  );
                })}
              </div>
            </>)}

            {/* HISTORIAL */}
            {section==="hist" && (<>
              <div className="stit">Últimos Sorteos Reales</div>
              {draws.length===0 ? (
                <div style={{textAlign:"center",padding:"40px 0",color:"var(--dim)"}}>
                  <div style={{fontSize:32,marginBottom:8}}>📊</div>
                  <div style={{fontSize:12}}>Sin datos. Ejecutá el scraper:</div>
                  <code style={{background:"var(--bg3)",padding:"7px 12px",borderRadius:8,fontSize:11,color:"var(--g)",display:"inline-block",marginTop:8}}>python scripts/ingest_ruta1000.py --days 30</code>
                </div>
              ) : (
                <div style={{overflowX:"auto"}}>
                  <table className="dtable">
                    <thead><tr><th>Fecha</th><th>Sorteo</th><th>1°</th><th>2° al 10°</th></tr></thead>
                    <tbody>
                      {draws.map((d,i)=>(
                        <tr key={i}>
                          <td style={{fontFamily:"'DM Mono',monospace",fontSize:10}}>{d.draw_date}</td>
                          <td><span className="sbadge">{d.sorteo}</span></td>
                          <td><span className="bs f" title={KINO[Number(d.pos_1)%100]}>{pad(Number(d.pos_1)%100)}</span></td>
                          <td>{[2,3,4,5,6,7,8,9,10].map(j=>{ const v=d[`pos_${j}`]; return v!=null?<span key={j} className="bs" title={KINO[Number(v)%100]}>{pad(Number(v)%100)}</span>:null; })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>)}
          </>)}

          {/* TESTIMONIOS */}
          <div className="tst">
            <div className="tst-h">
              <h2>Lo que dicen nuestros usuarios</h2>
              <p>Miles de quinieleros ya confían en Quiniela IA</p>
            </div>
            <div className="carousel">
              <div className="ctrack" style={{transform:`translateX(-${tidx*100}%)`}}>
                {TESTIMONIOS.map((t,i)=>(
                  <div className="tcard" key={i}>
                    <span style={{color:"#f59e0b",fontSize:14}}>{"★".repeat(t.s)}{"☆".repeat(5-t.s)}</span>
                    <div className="ttxt">&ldquo;{t.t}&rdquo;</div>
                    <div className="taut"><strong style={{color:"var(--t)"}}>{t.n}</strong><span style={{margin:"0 6px",opacity:.3}}>·</span>{t.c}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="dots">
              {TESTIMONIOS.map((_,i)=><button key={i} className={`dot ${i===tidx?"on":""}`} onClick={()=>setTidx(i)}/>)}
            </div>
          </div>

          {!isPremium && (
            <div className="pcta">
              <div style={{fontSize:28,marginBottom:7}}>🚀</div>
              <h3>Desbloqueá todo el potencial</h3>
              <p>Predicciones de 3 y 4 cifras + Redoblona basadas en 365 días de sorteos reales.</p>
              <a href={UALA} target="_blank" rel="noopener noreferrer" className="ucta" style={{fontSize:13,padding:"11px 20px"}}>
                💳 Suscribirme por $10.000/mes via Ualá
              </a>
              <div style={{fontSize:10,color:"var(--dim)",marginTop:7}}>Pago seguro via Ualá · Acceso inmediato · Cancelá cuando quieras</div>
            </div>
          )}

          {/* FOOTER */}
          <div className="footer">
            <p>¿Tenés preguntas? Contactanos: <a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
            <div className="disc">⚠ Herramienta de análisis estadístico con fines informativos. La quiniela es un juego de azar. Los resultados pasados no garantizan resultados futuros. Jugá responsablemente.</div>
          </div>
        </div>
      </div>
    </>
  );
}
