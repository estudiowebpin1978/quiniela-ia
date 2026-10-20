"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "@/lib/auth";
import "@/app/brinco/brinco.css";

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

const fmtNums = (nums: number[]) =>
  [...nums].sort((a, b) => a - b).map((n) => String(n).padStart(2, "0"));

const pct = (p: number) => `${(p * 100).toFixed(2)}%`;

const pageStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #010101 0%, #0d0d0d 100%)",
  color: "#e6e6e6",
  fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  paddingBottom: "80px",
} as const;

const wrapStyle = { maxWidth: "900px", margin: "0 auto", padding: "20px 16px" } as const;

const headStyle = { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "10px", marginBottom: "4px" } as const;

const titleStyle = { fontSize: "1.7rem", fontWeight: 800, margin: 0, background: "linear-gradient(180deg, #f5c542, #e0a800)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" } as const;

const subStyle = { color: "#9aa0a6", fontSize: "0.9rem", margin: "0 0 16px" } as const;

const tabsStyle = { display: "flex", gap: "8px", marginBottom: "18px", overflowX: "auto", paddingBottom: "2px" } as const;

const tabStyle = (on: boolean) => ({
  padding: "8px 16px", borderRadius: "10px", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem", whiteSpace: "nowrap",
  border: "1px solid #2a2a2a", background: on ? "linear-gradient(180deg, #f5c542, #e0a800)" : "#141414",
  color: on ? "#141414" : "#e6e6e6", borderColor: on ? "transparent" : "#2a2a2a",
  transition: "all 0.15s",
} as const);

const cardStyle = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
  border: "1px solid #2a2a2a", borderRadius: "14px", boxShadow: "0 12px 30px rgba(0,0,0,0.28)",
  padding: "18px", marginBottom: "16px",
} as const;

const metaStyle = { display: "flex", flexWrap: "wrap", gap: "8px 18px", color: "#9aa0a6", fontSize: "0.82rem", marginBottom: "14px" } as const;

const numsStyle = { display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "6px" } as const;

const numStyle = (accentA: string, accentB: string, accentInk: string) => ({
  width: "54px", height: "54px", display: "flex", alignItems: "center", justifyContent: "center",
  borderRadius: "12px", fontSize: "1.5rem", fontWeight: 800, color: accentInk,
  background: `linear-gradient(180deg, ${accentA}, ${accentB})`,
  boxShadow: "0 6px 0 rgba(0,0,0,0.4)", transition: "transform 0.15s ease",
} as const);

const altStyle = { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", marginTop: "10px", color: "#9aa0a6", fontSize: "0.82rem" } as const;

const chipStyle = {
  minWidth: "30px", padding: "3px 6px", textAlign: "center", borderRadius: "7px",
  background: "#1c1c1c", border: "1px solid #2a2a2a", color: "#e6e6e6",
  fontWeight: 600, fontSize: "0.82rem",
} as const;

const scoresStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "8px", marginTop: "6px" } as const;

const scoreRowStyle = { display: "flex", alignItems: "center", gap: "8px", fontSize: "0.78rem", color: "#9aa0a6" } as const;

const scoreNumStyle = { fontWeight: 800, color: "#f5c542", width: "24px" } as const;

const barStyle = { flex: 1, height: "6px", background: "#1c1c1c", borderRadius: "4px", overflow: "hidden" } as const;

const barFillStyle = (accentA: string, accentB: string) => ({ display: "block", height: "100%", background: `linear-gradient(90deg, ${accentA}, ${accentB})`, borderRadius: "4px" } as const);

const actionsStyle = { display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "16px" } as const;

const btnStyle = (ghost: boolean, accentA: string, accentB: string, accentInk: string) => ({
  padding: "10px 18px", borderRadius: "10px", border: ghost ? "1px solid #2a2a2a" : "none",
  fontWeight: 700, cursor: "pointer",
  background: ghost ? "transparent" : `linear-gradient(180deg, ${accentA}, ${accentB})`,
  color: ghost ? "#e6e6e6" : accentInk,
  boxShadow: ghost ? "none" : "0 5px 0 rgba(0,0,0,0.45)",
  transition: "all 0.15s",
} as const);

const avisoStyle = { marginTop: "16px", padding: "12px 14px", borderRadius: "10px", background: "rgba(245,197,66,0.08)", border: "1px solid rgba(245,197,66,0.25)", color: "#cfc8b0", fontSize: "0.8rem", lineHeight: 1.5 } as const;

const syncStyle = { fontSize: "0.78rem", color: "#9aa0a6", marginTop: "8px" } as const;

const gateStyle = { textAlign: "center" as const, padding: "40px 16px" } as const;

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
      const data = await res.json();
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
          <div style={cardStyle} className="brinco-loading">Cargando combinaciones…</div>
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
          <div style={cardStyle} className="brinco-gate">
            <h2 style={{ color: "#f5c542" }}>No se pudo cargar</h2>
            <p style={{ marginTop: "8px" }}>{error}</p>
            <button
              style={{
                ...btnStyle(false, "#f5c542", "#e0a800", "#141414"),
                marginTop: "16px",
              }}
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
  const badgeStyle = { display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: "999px", fontWeight: 700, fontSize: "11px", letterSpacing: "0.2px" } as const;
  const badgePremium = { ...badgeStyle, background: "linear-gradient(135deg, rgba(245,197,66,0.15), rgba(245,197,66,0.06))", color: "#f5c542", border: "1px solid rgba(245,197,66,0.35)" } as const;
  const badgeFree = { ...badgeStyle, background: "rgba(255,255,255,0.06)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.12)" } as const;

  return (
    <div style={pageStyle}>
      <div style={wrapStyle}>
        <div style={headStyle}>
          <h1 style={titleStyle}>Poceada Federal</h1>
          <p style={subStyle}>Combinaciones premium — IAFAS oficial</p>
        </div>

        <div style={tabsStyle}>
          <button style={tabStyle(true)} disabled>Combinaciones</button>
          <button style={tabStyle(false)} disabled>Backtesting</button>
        </div>

        {/* Sync status card */}
        <div style={cardStyle}>
          <div style={metaStyle}>
            <span><b>Sincronización:</b> {a.sincronizacion.ok ? "✓ OK" : "✗ Falló"}</span>
            <span><b>Fuente:</b> IAFAS</span>
            <span><b>Historial:</b> {a.historial.cantidad} sorteos ({a.historial.desde} → {a.historial.hasta})</span>
            {a.historial.antiguedadUltimoDias !== undefined && <span><b>Antigüedad último:</b> {a.historial.antiguedadUltimoDias} días</span>}
          </div>
          <div style={{ fontSize: "0.78rem", color: "#9aa0a6" }}>
            {a.sincronizacion.detalle || "Última actualización: " + (lastRefresh || "—")}
          </div>
        </div>

        {/* Combinaciones */}
        {a.combinaciones?.length ? (
          a.combinaciones.map((j) => (
            <div key={j.orden} style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "spaceBetween", marginBottom: "8px" }}>
                <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "#f5c542" }}>Jugada {j.orden}</span>
                <span style={badgePremium}>Premium</span>
              </div>
              <p style={{ color: "#9aa0a6", fontSize: "0.82rem", marginBottom: "12px" }}>{NOMBRES_ESTRATEGIA[j.estrategia] || j.estrategia}</p>
              <div style={numsStyle}>
                {j.numeros.map((n) => (
                  <span key={n} style={numStyle("#f5c542", "#e0a800", "#141414")}>{String(n).padStart(2, "0")}</span>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div style={cardStyle} className="brinco-empty">No hay combinaciones disponibles.</div>
        )}

        {/* Backtesting */}
        {a.backtesting?.length && (
          <div style={cardStyle}>
            <h2 style={{ fontSize: "15px", fontWeight: 800, margin: "0 0 8px", color: "#f5c542" }}>Backtesting walk-forward (OOS)</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
              {a.backtesting.map((b) => (
                <div key={b.estrategia} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #2a2a2a", borderRadius: "10px", padding: "12px" }}>
                  <div style={{ fontSize: "0.75rem", color: "#9aa0a6", marginBottom: "4px" }}>{NOMBRES_ESTRATEGIA[b.estrategia] || b.estrategia}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "spaceBetween" }}>
                    <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "#f5c542" }}>{b.aciertos} / {b.total}</span>
                    <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "#f5c542" }}>{pct(b.pct)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Acciones */}
        <div style={actionsStyle}>
          <button style={btnStyle(false, "#f5c542", "#e0a800", "#141414")} onClick={fetchCombinaciones} disabled={loading}>
            {loading ? "Actualizando…" : "Generar nuevo análisis"}
          </button>
          <button style={btnStyle(true, "", "", "")} onClick={() => router.push("/poceada-federal")}>
            Volver
          </button>
        </div>

        <div style={avisoStyle}>
          <strong>Honestidad:</strong> las combinaciones son selecciones heurísticas basadas en el historial validado,
          sin ventaja demostrada salvo que el backtest walk-forward lo avale con evidencia estadística.
          La probabilidad matemática (8 números de 20/100) NO depende del modelo.
        </div>

        <div style={syncStyle}>
          <span>Huella historial: {a.historial.huella}</span>
          {a.sincronizacion.datosNuevos && <span className="warn"> · Datos nuevos incorporados</span>}
          {error && <span className="err"> · {error}</span>}
        </div>
      </div>
    </div>
  );
}