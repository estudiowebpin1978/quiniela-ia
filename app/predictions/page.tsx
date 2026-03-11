"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────
type Sorteo = "Todos" | "Previa" | "Primera" | "Matutina" | "Vespertina" | "Nocturna";
interface FreqItem { num: number; total_appearances: number; first_place_count: number; }
interface DrawRow {
  draw_date: string; sorteo: string;
  pos_1: number; pos_2?: number; pos_3?: number; pos_4?: number; pos_5?: number;
  pos_6?: number; pos_7?: number; pos_8?: number; pos_9?: number; pos_10?: number;
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const S = `
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--gold:#c9a84c;--gl:#f0cc6e;--gd:#7a6430;--bg:#0a0806;--bg2:#120f0a;--bg3:#1c1610;--border:rgba(201,168,76,.18);--text:#e8dcc8;--dim:#8a7c6a}
  body{background:var(--bg);color:var(--text)}
  .app{min-height:100vh;background:var(--bg);font-family:'Barlow Condensed',sans-serif;position:relative}
  .noise{position:fixed;inset:0;pointer-events:none;z-index:0;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.04'/%3E%3C/svg%3E");opacity:.4}
  .wrap{position:relative;z-index:1;max-width:960px;margin:0 auto;padding:0 20px 80px}
  .header{text-align:center;padding:48px 0 32px;border-bottom:1px solid var(--border);margin-bottom:40px;position:relative}
  .header::after{content:'';position:absolute;bottom:-1px;left:50%;transform:translateX(-50%);width:120px;height:2px;background:var(--gold)}
  .eyebrow{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:var(--gold);margin-bottom:12px}
  h1{font-family:'Playfair Display',serif;font-size:clamp(36px,6vw,72px);font-weight:900;line-height:1;background:linear-gradient(135deg,var(--gl) 0%,var(--gold) 50%,var(--gd) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
  .sub{font-size:13px;color:var(--dim);letter-spacing:2px;font-family:'DM Mono',monospace}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--border);border:1px solid var(--border);margin-bottom:40px}
  .stat{background:var(--bg2);padding:16px;text-align:center}
  .stat-v{font-family:'Playfair Display',serif;font-size:28px;color:var(--gold);font-weight:700}
  .stat-l{font-size:11px;color:var(--dim);letter-spacing:2px;text-transform:uppercase;margin-top:4px}
  .controls{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:32px;align-items:center}
  .ctrl-lbl{font-size:11px;letter-spacing:3px;color:var(--gd);text-transform:uppercase}
  select{background:var(--bg3);border:1px solid var(--border);color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:15px;padding:8px 14px;appearance:none;cursor:pointer;outline:none;letter-spacing:1px}
  select:focus{border-color:var(--gold)}
  .btn{background:var(--gold);color:var(--bg);border:none;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;letter-spacing:3px;padding:10px 24px;cursor:pointer;text-transform:uppercase;transition:background .2s}
  .btn:hover{background:var(--gl)}
  .btn-outline{background:transparent;border:1px solid var(--border);color:var(--dim);font-family:'Barlow Condensed',sans-serif;font-size:13px;letter-spacing:2px;padding:9px 20px;cursor:pointer;transition:all .2s}
  .btn-outline:hover{border-color:var(--gold);color:var(--gold)}
  .tabs{display:flex;gap:0;margin-bottom:32px;border:1px solid var(--border)}
  .tab{flex:1;padding:12px 8px;text-align:center;background:transparent;border:none;color:var(--dim);font-family:'Barlow Condensed',sans-serif;font-size:14px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:all .2s;border-right:1px solid var(--border)}
  .tab:last-child{border-right:none}
  .tab.on{background:var(--bg3);color:var(--gold)}
  .tab:hover:not(.on){color:var(--text);background:rgba(255,255,255,.02)}
  .sec-title{font-family:'Playfair Display',serif;font-size:18px;color:var(--gold);margin-bottom:16px;display:flex;align-items:center;gap:12px}
  .sec-title::after{content:'';flex:1;height:1px;background:var(--border)}
  .digit-tabs{display:flex;gap:8px;margin-bottom:24px}
  .dtab{padding:8px 20px;border:1px solid var(--border);background:transparent;color:var(--dim);font-family:'Barlow Condensed',sans-serif;font-size:14px;letter-spacing:2px;cursor:pointer;transition:all .2s;position:relative}
  .dtab.on{border-color:var(--gold);color:var(--gold);background:rgba(201,168,76,.06)}
  .dtab:hover:not(.on){color:var(--text);border-color:rgba(201,168,76,.4)}
  .pbadge{position:absolute;top:-8px;right:-8px;background:var(--gold);color:var(--bg);font-size:8px;font-weight:700;padding:2px 5px;letter-spacing:1px;text-transform:uppercase}
  .pred-cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
  .pred-card{flex:1;min-width:120px;background:var(--bg2);border:1px solid var(--border);padding:20px 16px;text-align:center;position:relative;overflow:hidden;cursor:pointer;transition:all .2s}
  .pred-card:hover{border-color:var(--gold);background:rgba(201,168,76,.04)}
  .pred-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);opacity:0;transition:opacity .2s}
  .pred-card:hover::before{opacity:1}
  .pred-num{font-family:'Playfair Display',serif;font-size:36px;font-weight:900;color:var(--gl);letter-spacing:2px}
  .pred-rank{font-size:11px;color:var(--dim);letter-spacing:2px;margin-top:6px}
  .pred-conf{margin-top:8px;font-family:'DM Mono',monospace;font-size:10px;color:var(--gd)}
  .plock{position:relative;overflow:hidden}
  .plock-ov{position:absolute;inset:0;background:rgba(10,8,6,.88);backdrop-filter:blur(4px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:10;border:1px solid var(--gd)}
  .plock-ov p{font-size:14px;color:var(--gold);letter-spacing:2px;text-align:center}
  .plock-ov small{font-family:'DM Mono',monospace;font-size:11px;color:var(--dim)}
  .hot-cold{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:40px}
  .hc-card{background:var(--bg2);border:1px solid var(--border);padding:20px}
  .hc-title{font-size:12px;letter-spacing:3px;text-transform:uppercase;margin-bottom:14px}
  .hc-title.hot{color:#e87}
  .hc-title.cold{color:#7ae}
  .hc-list{display:flex;flex-direction:column;gap:8px}
  .hc-item{display:flex;align-items:center;gap:12px;font-family:'DM Mono',monospace}
  .hc-ball{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:500;flex-shrink:0}
  .hc-ball.hot{background:radial-gradient(circle at 35% 35%,#ff8a65,#c94c2a);color:#fff}
  .hc-ball.cold{background:radial-gradient(circle at 35% 35%,#81d4fa,#1565c0);color:#fff}
  .hc-info{flex:1}
  .hc-num{font-size:15px;color:var(--text)}
  .hc-cnt{font-size:11px;color:var(--dim)}
  .hc-bar-w{width:80px;height:4px;background:var(--bg3);border-radius:2px}
  .hc-bar{height:100%;border-radius:2px;transition:width .6s}
  .num-grid{display:grid;grid-template-columns:repeat(10,1fr);gap:4px}
  .ncell{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid transparent;position:relative;cursor:default;transition:all .15s;font-family:'DM Mono',monospace}
  .ncell:hover{z-index:2;transform:scale(1.12);border-color:var(--gold)!important}
  .ncell .nn{font-size:clamp(11px,1.8vw,14px);font-weight:500;position:relative;z-index:1}
  .ncell .nc{font-size:8px;color:var(--dim)}
  .draws-table{width:100%;border-collapse:collapse;font-family:'DM Mono',monospace;font-size:12px}
  .draws-table th{text-align:left;padding:8px 12px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--gd);border-bottom:1px solid var(--border)}
  .draws-table td{padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04)}
  .draws-table tr:hover td{background:rgba(201,168,76,.03)}
  .ball-m{display:inline-flex;width:26px;height:26px;border-radius:50%;align-items:center;justify-content:center;font-size:10px;font-weight:500;background:var(--bg3);border:1px solid var(--border);margin:1px}
  .ball-m.f{background:radial-gradient(circle at 35% 35%,var(--gl),var(--gd));color:var(--bg)}
  .stag{display:inline-block;padding:2px 8px;font-size:9px;letter-spacing:2px;text-transform:uppercase;border:1px solid var(--border);color:var(--dim)}
  .loading{text-align:center;padding:60px;font-family:'DM Mono',monospace;font-size:12px;color:var(--dim);letter-spacing:3px}
  .error-box{background:rgba(201,68,68,.1);border:1px solid rgba(201,68,68,.3);padding:16px;color:#e87;font-family:'DM Mono',monospace;font-size:12px;margin-bottom:24px}
  .disclaimer{margin-top:48px;padding:16px 20px;border:1px solid rgba(201,168,76,.15);background:rgba(201,168,76,.03);font-family:'DM Mono',monospace;font-size:11px;color:var(--dim);line-height:1.6}
  .premium-tag{margin-left:auto;color:var(--gold);font-family:'DM Mono',monospace;font-size:12px;letter-spacing:2px;border:1px solid var(--gold);padding:6px 14px}
  .term-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:40px}
  .term-card{background:var(--bg2);border:1px solid var(--border);padding:20px 16px;text-align:center}
  .term-num{font-family:'Playfair Display',serif;font-size:40px;font-weight:900;line-height:1}
  .term-bar-wrap{height:60px;display:flex;align-items:flex-end;margin:12px 0 8px}
  .term-bar{width:100%;border-radius:2px 2px 0 0;transition:height .5s}
  .term-count{font-family:'DM Mono',monospace;font-size:11px;color:var(--dim)}
  .info-box{padding:16px;background:var(--bg2);border:1px solid var(--border);margin-top:24px;font-family:'DM Mono',monospace;font-size:12px;color:var(--dim);line-height:1.7}
  @media(max-width:600px){.hot-cold{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}.pred-num{font-size:26px}.term-grid{grid-template-columns:repeat(5,1fr)}}
`;

// ─── Helpers ───────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");
const SORTEOS: Sorteo[] = ["Todos", "Previa", "Primera", "Matutina", "Vespertina", "Nocturna"];
const CONF = ["★★★★★", "★★★★☆", "★★★☆☆", "★★☆☆☆", "★☆☆☆☆"];

function buildPredictions(freq: FreqItem[], digits: number): string[] {
  const scored = freq
    .map((r) => ({ num: r.num, score: r.total_appearances + r.first_place_count * 3 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  if (digits === 2) return scored.slice(0, 5).map((x) => pad(x.num));
  if (digits === 3) return scored.slice(0, 5).map((x, i) => String(((i * 3 + 1) % 10) * 100 + x.num).padStart(3, "0"));
  return scored.slice(0, 5).map((x, i) => String(((i * 7 + 13) % 100) * 100 + x.num).padStart(4, "0"));
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function PredictionsPage() {
  const [tab, setTab] = useState<"predicciones" | "frecuencias" | "terminaciones" | "historial">("predicciones");
  const [sorteo, setSorteo] = useState<Sorteo>("Todos");
  const [digits, setDigits] = useState(2);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [freq, setFreq] = useState<FreqItem[]>([]);
  const [recentDraws, setRecentDraws] = useState<DrawRow[]>([]);
  const [totalDraws, setTotalDraws] = useState(0);
  const [regenKey, setRegenKey] = useState(0);

  // Fetch frequency data from API
  const fetchFreq = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ sorteo });
      const res = await fetch(`/api/predictions?${params}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setFreq(data.frequencyData ?? []);
      setTotalDraws(data.totalDraws ?? 0);
    } catch (e: any) {
      setError(e.message ?? "Error al cargar datos");
      // Fallback: generate mock data so UI still works
      const mock: FreqItem[] = Array.from({ length: 100 }, (_, i) => ({
        num: i,
        total_appearances: Math.floor(Math.random() * 200) + 50,
        first_place_count: Math.floor(Math.random() * 20),
      }));
      setFreq(mock);
    } finally {
      setLoading(false);
    }
  }, [sorteo]);

  const fetchDraws = useCallback(async () => {
    try {
      const res = await fetch(`/api/pending?limit=20&sorteo=${sorteo}`);
      if (res.ok) {
        const data = await res.json();
        setRecentDraws(data.draws ?? []);
      }
    } catch { /* silent */ }
  }, [sorteo]);

  useEffect(() => { fetchFreq(); fetchDraws(); }, [fetchFreq, fetchDraws, regenKey]);

  const maxFreq = freq.length ? Math.max(...freq.map((f) => f.total_appearances)) : 1;

  const getHeat = (n: number) => {
    const item = freq.find((f) => f.num === n);
    if (!item) return { bg: "rgba(76,122,201,0.12)", border: "rgba(76,122,201,0.2)" };
    const r = item.total_appearances / maxFreq;
    if (r > 0.75) return { bg: "rgba(201,68,68,0.35)", border: "rgba(201,68,68,0.6)" };
    if (r > 0.55) return { bg: "rgba(201,150,68,0.25)", border: "rgba(201,150,68,0.4)" };
    if (r > 0.35) return { bg: "rgba(201,168,76,0.15)", border: "rgba(201,168,76,0.25)" };
    return { bg: "rgba(76,122,201,0.12)", border: "rgba(76,122,201,0.2)" };
  };

  const hotNumbers = [...freq].sort((a, b) => b.total_appearances - a.total_appearances).slice(0, 7);
  const coldNumbers = [...freq].sort((a, b) => a.total_appearances - b.total_appearances).slice(0, 7);

  // Terminaciones
  const termFreq = Array(10).fill(0);
  freq.forEach((f) => { termFreq[f.num % 10] += f.total_appearances; });
  const maxTerm = Math.max(...termFreq) || 1;

  const predictions = buildPredictions(freq, digits);

  return (
    <>
      <style>{S}</style>
      <div className="app">
        <div className="noise" />
        <div className="wrap">

          {/* Header */}
          <header className="header">
            <div className="eyebrow">Sistema de Análisis Estadístico</div>
            <h1>Quiniela IA</h1>
            <div className="sub">Ciudad de Buenos Aires · {totalDraws > 0 ? `${totalDraws} sorteos en DB` : "Cargando datos..."}</div>
          </header>

          {/* Stats */}
          <div className="stats">
            {[
              { v: totalDraws || "—", l: "Sorteos en DB" },
              { v: freq.length ? Math.max(...freq.map(f => f.total_appearances)) : "—", l: "Máx. apariciones" },
              { v: freq.length > 0 ? pad(hotNumbers[0]?.num ?? 0) : "—", l: "Número caliente" },
              { v: isPremium ? "PRO" : "FREE", l: "Nivel de acceso" },
            ].map((s, i) => (
              <div className="stat" key={i}>
                <div className="stat-v">{s.v}</div>
                <div className="stat-l">{s.l}</div>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="controls">
            <span className="ctrl-lbl">Sorteo:</span>
            <select value={sorteo} onChange={(e) => setSorteo(e.target.value as Sorteo)}>
              {SORTEOS.map((s) => <option key={s}>{s}</option>)}
            </select>
            {!isPremium
              ? <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setIsPremium(true)}>🔓 Activar Premium</button>
              : <span className="premium-tag">✦ PREMIUM ACTIVO</span>
            }
          </div>

          {error && (
            <div className="error-box">
              ⚠ {error} — Mostrando datos de demostración. Verificá las variables de entorno de Supabase.
            </div>
          )}

          {/* Tabs */}
          <div className="tabs">
            {(["predicciones", "frecuencias", "terminaciones", "historial"] as const).map((t) => (
              <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {loading && <div className="loading">ANALIZANDO DATOS...</div>}

          {/* ─── Predicciones ─── */}
          {!loading && tab === "predicciones" && (
            <div>
              <div className="sec-title">Motor de Predicción</div>
              <div className="digit-tabs">
                {[2, 3, 4].map((d) => (
                  <button key={d} className={`dtab ${digits === d ? "on" : ""}`} onClick={() => setDigits(d)}>
                    {d > 2 && <span className="pbadge">PRO</span>}
                    {d} dígitos
                  </button>
                ))}
                <button className="btn-outline" style={{ marginLeft: "auto" }} onClick={() => setRegenKey(k => k + 1)}>
                  ↻ Actualizar
                </button>
              </div>

              <div className={digits > 2 && !isPremium ? "plock" : ""}>
                <div className="pred-cards">
                  {predictions.map((p, i) => (
                    <div className="pred-card" key={i}>
                      <div className="pred-num">{p}</div>
                      <div className="pred-rank">#{i + 1} recomendado</div>
                      <div className="pred-conf">{CONF[i]}</div>
                    </div>
                  ))}
                </div>
                {digits > 2 && !isPremium && (
                  <div className="plock-ov">
                    <div style={{ fontSize: 32 }}>🔐</div>
                    <p>Predicciones {digits}-dígitos</p>
                    <small>Requiere acceso Premium</small>
                    <button className="btn" onClick={() => setIsPremium(true)}>Desbloquear Premium</button>
                  </div>
                )}
              </div>

              <div className="info-box" style={{ marginTop: 24 }}>
                <strong style={{ color: "var(--gold)" }}>ℹ Metodología:</strong> Score = frecuencia total + (3 × apariciones en 1° puesto). Análisis sobre los últimos 365 días de la Quiniela de la Ciudad de Buenos Aires.
              </div>

              {/* Hot/Cold */}
              <div className="sec-title" style={{ marginTop: 40 }}>Números Calientes & Fríos</div>
              <div className="hot-cold">
                {[
                  { title: "🔥 Calientes", cls: "hot", data: hotNumbers, grad: "linear-gradient(90deg,#c94c2a,#ff8a65)" },
                  { title: "❄ Fríos", cls: "cold", data: coldNumbers, grad: "linear-gradient(90deg,#1565c0,#81d4fa)" },
                ].map(({ title, cls, data, grad }) => (
                  <div className="hc-card" key={cls}>
                    <div className={`hc-title ${cls}`}>{title}</div>
                    <div className="hc-list">
                      {data.map((item) => (
                        <div className="hc-item" key={item.num}>
                          <div className={`hc-ball ${cls}`}>{pad(item.num)}</div>
                          <div className="hc-info">
                            <div className="hc-num">{pad(item.num)}</div>
                            <div className="hc-cnt">{item.total_appearances} apariciones · {item.first_place_count}× primero</div>
                          </div>
                          <div className="hc-bar-w">
                            <div className="hc-bar" style={{ width: `${(item.total_appearances / maxFreq) * 100}%`, background: grad }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Frecuencias ─── */}
          {!loading && tab === "frecuencias" && (
            <div>
              <div className="sec-title">Mapa de Calor — Números 00 a 99</div>
              <div className="num-grid">
                {Array.from({ length: 100 }, (_, n) => {
                  const { bg, border } = getHeat(n);
                  const item = freq.find((f) => f.num === n);
                  return (
                    <div key={n} className="ncell" style={{ background: bg, borderColor: border }} title={`${pad(n)}: ${item?.total_appearances ?? 0} veces`}>
                      <span className="nn">{pad(n)}</span>
                      <span className="nc">{item?.total_appearances ?? 0}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Terminaciones ─── */}
          {!loading && tab === "terminaciones" && (
            <div>
              <div className="sec-title">Frecuencia por Terminación (0–9)</div>
              <div className="term-grid">
                {termFreq.map((count, term) => {
                  const pct = Math.round((count / maxTerm) * 100);
                  return (
                    <div key={term} className="term-card" style={{ borderColor: pct > 70 ? "rgba(201,168,76,.5)" : "var(--border)" }}>
                      <div className="term-num" style={{ color: pct > 70 ? "var(--gold)" : "var(--dim)" }}>{term}</div>
                      <div className="term-bar-wrap">
                        <div className="term-bar" style={{
                          height: `${pct}%`,
                          background: pct > 70 ? "linear-gradient(0deg,var(--gd),var(--gold))" : "linear-gradient(0deg,rgba(255,255,255,.05),rgba(255,255,255,.12))"
                        }} />
                      </div>
                      <div className="term-count">{count.toLocaleString()}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Historial ─── */}
          {!loading && tab === "historial" && (
            <div>
              <div className="sec-title">Últimos Sorteos</div>
              {recentDraws.length === 0
                ? <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "var(--dim)", padding: "40px 0", textAlign: "center" }}>
                    No hay sorteos en la base de datos. Ejecutá el scraper para poblar datos.
                  </div>
                : (
                  <table className="draws-table">
                    <thead>
                      <tr><th>Fecha</th><th>Sorteo</th><th>1°</th><th>Posiciones 2–10</th></tr>
                    </thead>
                    <tbody>
                      {recentDraws.map((d, i) => (
                        <tr key={i}>
                          <td>{d.draw_date}</td>
                          <td><span className="stag">{d.sorteo}</span></td>
                          <td><span className="ball-m f">{pad(d.pos_1 % 100)}</span></td>
                          <td>
                            {[d.pos_2, d.pos_3, d.pos_4, d.pos_5, d.pos_6, d.pos_7, d.pos_8, d.pos_9, d.pos_10]
                              .filter(Boolean)
                              .map((n, j) => <span key={j} className="ball-m">{pad((n ?? 0) % 100)}</span>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          )}

          <div className="disclaimer">
            <strong style={{ color: "var(--gd)" }}>⚠ Advertencia:</strong> Esta herramienta es de análisis estadístico con fines educativos. La quiniela es un juego de azar. Los resultados pasados no garantizan resultados futuros. Juegue responsablemente.
          </div>
        </div>
      </div>
    </>
  );
}
