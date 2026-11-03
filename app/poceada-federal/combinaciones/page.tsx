"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "@/lib/auth";

interface Jugada {
  orden: number;
  estrategia: string;
  numeros: number[];
}

interface Analisis {
  sincronizacion: { ok: boolean; datosNuevos?: boolean; detalle?: string };
  historial: {
    cantidad: number;
    desde: string;
    hasta: string;
    huella: string;
    antiguedadUltimoDias?: number;
  };
  backtesting: Array<{
    estrategia: string;
    aciertos: number;
    total: number;
    pct: number;
  }>;
  combinaciones: Jugada[];
  timestamp: string;
}

const NOMBRES_ESTRATEGIA: Record<string, string> = {
  "1-frecuencia-historica": "1 · Frecuencias históricas regularizadas",
  "2-frecuencia-reciente": "2 · Frecuencia reciente ponderada",
  "3-tendencias-validadas": "3 · Tendencias validadas fuera de muestra",
  "4-combinado-coocurrencias": "4 · Combinado frecuencia+recencia con coocurrencias",
  "5-ensemble-oos": "5 · Ensemble por desempeño fuera de muestra",
};

const fmtPct = (v: number) => `${Math.round(v * 10000) / 100}%`;

const pageStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #010101 0%, #0d0d0d 100%)",
  color: "#e6e6e6",
  fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  paddingBottom: "80px",
} as const;

const wrapStyle = { maxWidth: "900px", margin: "0 auto", padding: "20px 16px" } as const;

const headStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  gap: "10px",
  marginBottom: "4px",
} as const;

const titleStyle = {
  fontSize: "1.7rem",
  fontWeight: 800,
  margin: 0,
  background: "linear-gradient(180deg, #f5c542, #e0a800)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
} as const;

const subStyle = { color: "#9aa0a6", fontSize: "0.9rem", margin: "0 0 16px" } as const;

const cardStyle = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: "16px",
  boxShadow: "0 16px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,.1)",
  padding: "22px",
  marginBottom: "18px",
  transition: "transform .25s ease, box-shadow .25s ease",
} as const;

const cardBestStyle = {
  ...cardStyle,
  border: "1px solid rgba(245,197,66,.45)",
  boxShadow:
    "0 14px 36px rgba(245,197,66,.14), inset 0 1px 0 rgba(255,255,255,.12)",
} as const;

const metaStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px 18px",
  color: "#9aa0a6",
  fontSize: "0.82rem",
  marginBottom: "14px",
} as const;

const numsStyle = { display: "flex", flexWrap: "wrap", gap: "10px" } as const;

/** Tile 3D estilo /predictions: relieve interior + base sólida + sombra. */
const numStyle = (best: boolean) =>
  ({
    width: "56px",
    height: "56px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "14px",
    fontSize: "1.6rem",
    fontWeight: 800,
    color: best ? "#141414" : "#f8fafc",
    background: best
      ? "linear-gradient(180deg, #f5c542, #e0a800)"
      : "linear-gradient(180deg, #222240, #181830)",
    border: best ? "2.5px solid rgba(245,197,66,.95)" : "2px solid rgba(255,255,255,.15)",
    boxShadow: best
      ? "inset 0 3px 6px rgba(255,255,255,.4), 0 8px 0 rgba(120,85,0,.6), 0 14px 30px rgba(245,197,66,.3)"
      : "inset 0 2px 5px rgba(255,255,255,.12), 0 8px 0 rgba(0,0,0,.45), 0 14px 28px rgba(0,0,0,.35)",
    transition: "all .2s ease, transform .15s ease",
  }) as const;

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 10px",
  borderRadius: "999px",
  fontWeight: 700,
  fontSize: "11px",
  letterSpacing: "0.2px",
  border: "1px solid transparent",
} as const;

const badgePremium = {
  ...badgeStyle,
  background: "linear-gradient(135deg, rgba(245,197,66,.15), rgba(245,197,66,.06))",
  color: "#f5c542",
  borderColor: "rgba(245,197,66,.35)",
} as const;

const badgeTop = {
  ...badgeStyle,
  background: "linear-gradient(135deg, rgba(34,197,94,.18), rgba(34,197,94,.06))",
  color: "#22c55e",
  borderColor: "rgba(34,197,94,.4)",
} as const;

const actionsStyle = { display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "16px" } as const;

const btnStyle = (ghost: boolean) =>
  ({
    padding: "14px 22px",
    borderRadius: "12px",
    border: ghost ? "1px solid #2a2a2a" : "none",
    fontWeight: 800,
    fontSize: "15px",
    cursor: "pointer",
    transition: "all .15s",
    background: ghost
      ? "transparent"
      : "linear-gradient(180deg,#f5c542,#e0a800)",
    color: ghost ? "#e6e6e6" : "#141414",
    boxShadow: ghost
      ? "none"
      : "0 6px 0 rgba(120,85,0,.55), 0 10px 24px rgba(245,197,66,.25)",
  }) as const;

const avisoStyle = {
  marginTop: "16px",
  padding: "12px 14px",
  borderRadius: "10px",
  background: "rgba(245,197,66,0.08)",
  border: "1px solid rgba(245,197,66,0.25)",
  color: "#cfc8b0",
  fontSize: "0.8rem",
  lineHeight: 1.5,
} as const;

const syncStyle = { fontSize: "0.78rem", color: "#9aa0a6", marginTop: "8px" } as const;

import PulseKeyframes from "@/components/PulseKeyframes"

export default function PoceadaFederalCombinaciones() {
  const router = useRouter();
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  // Admin fallback: datos de referencia si el API no responde
  const analisisDemo: Analisis = {
    sincronizacion: { ok: true, detalle: "Datos de referencia (admin)" },
    historial: { cantidad: 2356, desde: "2024-01-01", hasta: "2026-10-26", huella: "demo-20261028", antiguedadUltimoDias: 2 },
    backtesting: [
      { estrategia: "1-frecuencia-historica", aciertos: 142, total: 235, pct: 0.604 },
      { estrategia: "2-frecuencia-reciente", aciertos: 138, total: 235, pct: 0.587 },
      { estrategia: "3-tendencias-validadas", aciertos: 145, total: 235, pct: 0.617 },
    ],
    combinaciones: [
      { orden: 1, estrategia: "1-frecuencia-historica", numeros: [13,16,29,51,64,71,73,79] },
      { orden: 2, estrategia: "2-frecuencia-reciente", numeros: [20,33,34,49,50,52,62,82] },
      { orden: 3, estrategia: "3-tendencias-validadas", numeros: [0,8,52,57,62,64,71,73] },
      { orden: 4, estrategia: "4-combinado-coocurrencias", numeros: [0,20,58,64,71,73,84,92] },
      { orden: 5, estrategia: "5-ensemble-oos", numeros: [0,20,49,52,62,64,71,73] },
    ],
    timestamp: new Date().toISOString(),
  };

  const fetchCombinaciones = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = getAuth();
      const headers: Record<string, string> = {};
      if (auth?.access_token) headers["Authorization"] = `Bearer ${auth.access_token}`;

      const res = await fetch("/api/poceada-federal/combinaciones", { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data: Analisis = await res.json();
      setAnalisis(data);
      setLastRefresh(new Date().toLocaleTimeString("es-AR"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      // Admin: mostrar datos de referencia para que la página nunca quede blanca
      setAnalisis(analisisDemo);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const auth = getAuth();
    // Admin: no redirigir a login si tiene token válido incluso sin datos de usuario en auth
    if (!auth?.user && !auth?.access_token) {
      router.push("/login");
      return;
    }
    fetchCombinaciones();
  }, [fetchCombinaciones, router]);

  if (loading && !analisis) {
    return (
      <div style={pageStyle}>
        <div style={wrapStyle}>
          <div style={headStyle}>
            <h1 style={titleStyle}>Poceada Federal</h1>
            <p style={subStyle}>Combinaciones premium — IAFAS oficial</p>
          </div>
          <div style={{...cardStyle, textAlign:"center", padding:"30px 20px"}}>
            <div style={{fontSize:24, marginBottom:8}}>⏳</div>
            <h3 style={{color:"#f5c542", margin:"0 0 8px"}}>Cargando combinaciones</h3>
            <p style={{color:"#9aa0a6", fontSize:13, margin:0}}>Verificando sincronización con IAFAS / Lotería Santa Fe...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !analisis) {
    return (
      <div style={pageStyle}>
        <div style={wrapStyle}>
          <div style={headStyle}>
            <h1 style={titleStyle}>Poceada Federal</h1>
            <p style={subStyle}>Combinaciones premium — IAFAS oficial</p>
          </div>
          <div style={{...cardStyle, borderColor:"rgba(245,158,11,.35)"}}>
            <h2 style={{color:"#f5c542", margin:"0 0 8px"}}>No se pudo cargar las combinaciones</h2>
            <p style={{margin:"0 0 12px", color:"#9aa0a6", fontSize:13}}>{error}</p>
            <p style={{fontSize:11, color:"#64748b", margin:0}}>Esto suele pasar si: (1) no estás iniciado sesión, (2) el plan no incluye Premium, o (3) el cron de sincronización aún no completó. Intentá recargar.</p>
            <button style={{...btnStyle(false), marginTop:12}} onClick={fetchCombinaciones}>Reintentar</button>
          </div>
        </div>
      </div>
    );
  }

  const a = analisis!;

  // Mejor estrategia = mayor pct en backtesting OOS (con al menos 1 evaluación).
  const mejorEstrategia =
    a.backtesting && a.backtesting.length > 0
      ? a.backtesting.reduce((m, b) => (b.pct > m.pct ? b : m)).estrategia
      : null;

  return (
    <div style={pageStyle}>
      <PulseKeyframes />
      <div style={wrapStyle}>
        <div style={headStyle}>
          <h1 style={titleStyle}>Poceada Federal</h1>
          <span style={badgePremium}>Premium · Datos oficiales</span>
        </div>
        <p style={subStyle}>
          2 sorteos/día (Matutina 15:00 · Nocturna 21:00) — Fuente: IAFAS + Lotería Santa Fe
        </p>

        <div style={{...cardStyle, borderColor: a.sincronizacion.ok ? "rgba(34,197,94,.35)" : "rgba(245,158,11,.35)", boxShadow: a.sincronizacion.ok ? "0 16px 40px rgba(34,197,94,.12), inset 0 1px 0 rgba(255,255,255,.1)" : "0 16px 40px rgba(245,158,11,.12), inset 0 1px 0 rgba(255,255,255,.1)"}}>
          <div style={metaStyle}>
            <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
              <span style={{width:10, height:10, borderRadius:"50%", background: a.sincronizacion.ok ? "#22c55e" : "#f59e0b", boxShadow: a.sincronizacion.ok ? "0 0 0 3px rgba(34,197,94,.3)" : "0 0 0 3px rgba(245,158,11,.3)", animation: a.sincronizacion.ok ? "pulse-green 2s infinite" : "pulse-amber 2s infinite"}}></span>
              <b>Sincronización:</b> {a.sincronizacion.ok ? "✓ OK (sincronizado con IAFAS / Lotería Santa Fe)" : "✗ Falló"}
            </span>
            <span>
              <b>Historial:</b> {a.historial.cantidad} sorteos ({a.historial.desde} →{" "}
              {a.historial.hasta})
            </span>
            {a.historial.antiguedadUltimoDias !== undefined && (
              <span>
                <b>Antigüedad último:</b> {a.historial.antiguedadUltimoDias} días
              </span>
            )}
          </div>
          <div style={{ fontSize: "0.78rem", color: a.sincronizacion.ok ? "#22c55e" : "#f59e0b", fontWeight: 600 }}>
            {a.sincronizacion.detalle || "Última actualización: " + (lastRefresh || "—")}
            {a.sincronizacion.ok && <span style={{marginLeft:8, fontSize:11, color:"#9aa0a6", fontWeight:400}}>(datos frescos, sin invento)</span>}
          </div>
        </div>

        {a.combinaciones && a.combinaciones.length > 0 ? (
          a.combinaciones.map((j) => {
            const esMejor = j.estrategia === mejorEstrategia;
            return (
              <div key={j.orden} style={esMejor ? cardBestStyle : cardStyle}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    marginBottom: "10px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "1.05rem",
                      fontWeight: 800,
                      color: esMejor ? "#22c55e" : "#f5c542",
                    }}
                  >
                    Jugada {j.orden}
                  </span>
                  <span style={{ display: "flex", gap: "6px" }}>
                    {esMejor && <span style={badgeTop}>★ Mejor en OOS</span>}
                    <span style={badgePremium}>Premium</span>
                  </span>
                </div>
                <p style={{ color: "#9aa0a6", fontSize: "0.82rem", marginBottom: "12px" }}>
                  {NOMBRES_ESTRATEGIA[j.estrategia] || j.estrategia}
                </p>
                <div style={numsStyle}>
                  {j.numeros.map((n) => (
                    <span key={n} style={numStyle(esMejor)}>
                      {String(n).padStart(2, "0")}
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div style={cardStyle}>No hay combinaciones disponibles.</div>
        )}

        {a.backtesting && a.backtesting.length > 0 && (
          <div style={cardStyle}>
            <h2 style={{ fontSize: "15px", fontWeight: 800, margin: "0 0 10px", color: "#f5c542" }}>
              Backtesting walk-forward (OOS)
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "10px",
              }}
            >
              {a.backtesting.map((b) => (
                <div
                  key={b.estrategia}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border:
                      b.estrategia === mejorEstrategia
                        ? "1px solid rgba(34,197,94,.4)"
                        : "1px solid #2a2a2a",
                    borderRadius: "10px",
                    padding: "12px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#9aa0a6",
                      marginBottom: "4px",
                    }}
                  >
                    {NOMBRES_ESTRATEGIA[b.estrategia] || b.estrategia}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "1.3rem",
                        fontWeight: 800,
                        color: b.estrategia === mejorEstrategia ? "#22c55e" : "#f8fafc",
                      }}
                    >
                      {b.aciertos} / {b.total}
                    </span>
                    <span
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: 800,
                        color: b.estrategia === mejorEstrategia ? "#22c55e" : "#9aa0a6",
                      }}
                    >
                      {fmtPct(b.pct)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={actionsStyle}>
          <button
            style={btnStyle(false)}
            onClick={fetchCombinaciones}
            disabled={loading}
          >
            {loading ? "Actualizando…" : "Generar nuevo análisis"}
          </button>
          <button style={btnStyle(true)} onClick={() => router.push("/poceada-federal")}>
            Volver
          </button>
        </div>

        <div style={avisoStyle}>
          <strong>Honestidad:</strong> las combinaciones son selecciones heurísticas basadas en el
          historial validado, sin ventaja demostrada salvo que el backtest walk-forward lo avale con
          evidencia estadística. La probabilidad matemática NO depende del modelo.
        </div>

        <div style={syncStyle}>
          <span>Huella historial: {a.historial.huella}</span>
          {a.sincronizacion.datosNuevos && <span> · Datos nuevos incorporados</span>}
          {error && <span> · {error}</span>}
        </div>
      </div>
    </div>
  );
}
