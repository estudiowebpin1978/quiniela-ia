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
  background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: "14px",
  boxShadow: "0 12px 30px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,.08)",
  padding: "18px",
  marginBottom: "16px",
  transition: "transform .2s, box-shadow .2s",
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
    width: "54px",
    height: "54px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "12px",
    fontSize: "1.5rem",
    fontWeight: 800,
    color: best ? "#141414" : "#f8fafc",
    background: best
      ? "linear-gradient(180deg,#f5c542,#e0a800)"
      : "linear-gradient(180deg,#1a1a3a,#0f0f22)",
    border: best ? "2px solid rgba(245,197,66,.9)" : "2px solid rgba(255,255,255,.12)",
    boxShadow: best
      ? "inset 0 2px 4px rgba(255,255,255,.35), 0 6px 0 rgba(120,85,0,.55), 0 12px 26px rgba(245,197,66,.25)"
      : "inset 0 2px 4px rgba(255,255,255,.15), 0 6px 0 rgba(0,0,0,.4), 0 12px 24px rgba(0,0,0,.3)",
    transition: "transform .15s ease",
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

export default function PoceadaFederalCombinaciones() {
  const router = useRouter();
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const auth = getAuth();
    if (!auth?.user) {
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
          <div style={cardStyle}>Cargando combinaciones…</div>
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
          <div style={cardStyle}>
            <h2 style={{ color: "#f5c542" }}>No se pudo cargar</h2>
            <p style={{ marginTop: "8px" }}>{error}</p>
            <button
              style={{ ...btnStyle(false), marginTop: "16px" }}
              onClick={fetchCombinaciones}
            >
              Reintentar
            </button>
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
      <div style={wrapStyle}>
        <div style={headStyle}>
          <h1 style={titleStyle}>Poceada Federal</h1>
          <span style={badgePremium}>Premium · Datos oficiales</span>
        </div>
        <p style={subStyle}>
          2 sorteos/día (Matutina 15:00 · Nocturna 21:00) — Fuente: IAFAS + Lotería Santa Fe
        </p>

        <div style={cardStyle}>
          <div style={metaStyle}>
            <span>
              <b>Sincronización:</b> {a.sincronizacion.ok ? "✓ OK" : "✗ Falló"}
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
          <div style={{ fontSize: "0.78rem", color: "#9aa0a6" }}>
            {a.sincronizacion.detalle || "Última actualización: " + (lastRefresh || "—")}
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
