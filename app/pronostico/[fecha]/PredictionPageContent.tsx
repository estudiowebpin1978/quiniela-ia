"use client";

import { useState, useEffect, useCallback } from "react";
import { Button3D } from "@/components/ui/button-3d";
import { NumberTile3D } from "@/components/ui/number-tile-3d";
import { AnalysisParagraph, TurnoSummary } from "@/components/seo/AnalysisParagraph";
import { mapApiPredictionCard, type PredictionCardData } from "@/lib/api/predictions";

// Extend Window for one-time keyframe injection flags
declare global {
  interface Window {
    __pp_keyframes_injected?: boolean;
    __rv_slide_down_injected?: boolean;
  }
}

const TURNOS_ORDER = ["previa", "primera", "matutina", "vespertina", "nocturna"];
const TURNOS_LABELS: Record<string, string> = {
  previa: "Previa",
  primera: "Primera",
  matutina: "Matutina",
  vespertina: "Vespertina",
  nocturna: "Nocturna",
};

interface DrawData {
  id: string;
  date: string;
  turno: string;
  numbers: number[];
  head_number: number | null;
}

type PredictionData = PredictionCardData;

interface Props {
  fecha: string;
  draws: DrawData[];
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getStatusBadge(turno: string, draws: DrawData[]) {
  const draw = draws.find((d) => d.turno === turno);
  if (!draw) return { label: "—", bg: "rgba(255,255,255,0.05)", color: "#94a3b8", border: "rgba(255,255,255,0.1)" };
  if (draw.numbers && draw.numbers.length > 0) {
    return { label: "Finalizado", bg: "rgba(16,185,129,0.12)", color: "#34d399", border: "rgba(16,185,129,0.35)" };
  }
  return { label: "Pendiente", bg: "rgba(255,255,255,0.05)", color: "#94a3b8", border: "rgba(255,255,255,0.1)" };
}

const pageStyle = {
  minHeight: "100vh",
  background: "#020617",
  color: "#fff",
  fontFamily: "'Inter', system-ui, sans-serif",
} as const;

const headerStyle = {
  position: "sticky", top: 0, zIndex: 50,
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(2,6,23,0.8)",
  backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
} as const;

const containerStyle = {
  maxWidth: "800px", margin: "0 auto", padding: "0 16px",
} as const;

const headerInnerStyle = {
  height: "64px", display: "flex", alignItems: "center", justifyContent: "spaceBetween",
} as const;

const titleStyle = {
  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
  fontWeight: 700, fontSize: "20px",
  background: "linear-gradient(135deg, #34d399, #22d3ee)",
  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
  backgroundClip: "text", margin: 0,
} as const;

const dateLabelStyle = { fontSize: "10px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" } as const;
const dateValueStyle = { fontFamily: "'Space Grotesk', monospace", fontSize: "14px", color: "#34d399", textTransform: "capitalize" } as const;

const mainStyle = { padding: "24px 16px 80px" } as const;

const turnoGridStyle = { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginBottom: "24px" } as const;

const turnoBtnBase = {
  background: "linear-gradient(135deg, rgba(30,41,59,0.7), rgba(15,23,42,0.85))",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 20px 40px -15px rgba(0,0,0,0.6), inset 0 1px 0 0 rgba(255,255,255,0.2)",
  borderRadius: "16px", padding: "16px", textAlign: "center",
  transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)", cursor: "pointer",
} as const;

const turnoBtnSelected = {
  boxShadow: "0 20px 40px -15px rgba(0,0,0,0.6), inset 0 1px 0 0 rgba(255,255,255,0.2), 0 0 20px rgba(16,185,129,0.2)",
  borderColor: "rgba(16,185,129,0.5)",
} as const;

const turnoLabelStyle = {
  fontFamily: "'Space Grotesk', monospace", fontSize: "13px", fontWeight: 700,
  textTransform: "capitalize", marginBottom: "8px", color: "#fff",
} as const;

const badgeStyle = {
  display: "inline-flex", alignItems: "center", gap: "4px",
  padding: "4px 10px", borderRadius: "9999px",
  fontSize: "10px", fontWeight: 700, letterSpacing: "0.3px",
  whiteSpace: "nowrap",
} as const;

const sectionStyle = { marginTop: "24px" } as const;

const headerRowStyle = { display: "flex", alignItems: "center", justifyContent: "spaceBetween", marginBottom: "16px" } as const;

const h2Style = { fontFamily: "'Space Grotesk', sans-serif", fontSize: "24px", fontWeight: 800, margin: "0 0 4px", lineHeight: 1.1 } as const;

const h2SubStyle = { color: "#64748b", fontSize: "14px", marginTop: "8px", lineHeight: 1.5 } as const;

const cardStyle = {
  background: "linear-gradient(135deg, rgba(30,41,59,0.7), rgba(15,23,42,0.85))",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 20px 40px -15px rgba(0,0,0,0.6), inset 0 1px 0 0 rgba(255,255,255,0.2)",
  borderRadius: "20px", padding: "24px",
  marginTop: "24px",
} as const;

const navGridStyle = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" } as const;

const footerStyle = {
  borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: "48px", paddingTop: "24px", textAlign: "center",
} as const;

const footerTextStyle = { color: "#64748b", fontSize: "13px", lineHeight: 1.6 } as const;
const linkStyle = { color: "#f472b6", textDecoration: "underline", margin: "0 4px" } as const;

const loadingStyle = {
  width: "40px", height: "40px", border: "3px solid rgba(16,185,129,0.3)",
  borderTopColor: "#34d399", borderRadius: "50%", margin: "0 auto 16px",
  animation: "spin 1s linear infinite",
} as const;

const centerBoxStyle = { textAlign: "center", padding: "32px" } as const;

const glassPanel = {
  background: "linear-gradient(135deg, rgba(30,41,59,0.7), rgba(15,23,42,0.85))",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 20px 40px -15px rgba(0,0,0,0.6), inset 0 1px 0 0 rgba(255,255,255,0.2)",
  borderRadius: "20px", padding: "24px",
} as const;

const glowEmerald = {
  boxShadow: "0 0 30px -5px rgba(16,185,129,0.35)",
} as const;

const keyframes = `
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes slide-down { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
`;

export default function PredictionPageContent({ fecha, draws }: Props) {
  const [selectedTurno, setSelectedTurno] = useState<string>(draws[0]?.turno || "nocturna");
  const [predictions, setPredictions] = useState<Record<string, PredictionData>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const formattedDate = formatDate(fecha);
  const currentDraw = draws.find((d) => d.turno === selectedTurno);

  const fetchPrediction = useCallback(async (turno: string) => {
    if (predictions[turno] || loading[turno]) return;
    setLoading((prev) => ({ ...prev, [turno]: true }));

    try {
      const authRaw = localStorage.getItem("quiniela-ia-auth");
      const auth = authRaw ? JSON.parse(authRaw) : null;
      const headers: Record<string, string> = {};
      if (auth?.access_token) headers["Authorization"] = `Bearer ${auth.access_token}`;

      const res = await fetch(`/api/predictions?sorteo=${turno}&date=${fecha}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const mapped = mapApiPredictionCard(data, turno);
        setPredictions((prev) => ({ ...prev, [turno]: mapped }));
      }
    } catch (e) {
      console.error("Error fetching prediction:", e);
    } finally {
      setLoading((prev) => ({ ...prev, [turno]: false }));
    }
  }, [fecha, predictions, loading]);

  const handleTurnoChange = (turno: string) => {
    setSelectedTurno(turno);
    fetchPrediction(turno);
  };

  useEffect(() => {
    if (!predictions[selectedTurno] && !loading[selectedTurno]) {
      fetchPrediction(selectedTurno);
    }
  }, [selectedTurno, predictions, loading, fetchPrediction]);

  // Inject keyframes once
  useEffect(() => {
    if (typeof window !== "undefined" && !window.__pp_keyframes_injected) {
      const style = document.createElement("style");
      style.textContent = keyframes;
      document.head.appendChild(style);
      window.__pp_keyframes_injected = true;
    }
  }, []);

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div style={containerStyle}>
          <div style={headerInnerStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "28px" }}>🎯</span>
              <h1 style={titleStyle}>Quiniela IA</h1>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={dateLabelStyle}>Pronóstico Histórico</p>
              <p style={dateValueStyle}>{formattedDate}</p>
            </div>
          </div>
        </div>
      </header>

      <main style={mainStyle}>
        {/* Turnos Grid */}
        <div style={turnoGridStyle}>
          {draws.map((d) => {
            const status = getStatusBadge(d.turno, draws);
            const isSelected = selectedTurno === d.turno;
            return (
              <button
                key={d.turno}
                onClick={() => handleTurnoChange(d.turno)}
                style={{
                  ...turnoBtnBase,
                  ...(isSelected ? turnoBtnSelected : {}),
                }}
              >
                <p style={turnoLabelStyle}>{TURNOS_LABELS[d.turno] || d.turno}</p>
                {d.head_number != null && (
                  <NumberTile3D size="sm" variant="emerald" number={d.head_number.toString().padStart(2, "0")} />
                )}
                <span style={{
                  ...badgeStyle,
                  background: status.bg, color: status.color, border: `1px solid ${status.border}`,
                }}>
                  {status.label}
                </span>
              </button>
            );
          })}
        </div>

        <div style={sectionStyle}>
          <div style={headerRowStyle}>
            <div>
              <h2 style={h2Style}>
                {TURNOS_LABELS[selectedTurno] || selectedTurno}
                <span style={{ color: "#64748b", fontWeight: 400, fontSize: "18px", marginLeft: "8px" }}>
                  — {currentDraw?.head_number?.toString().padStart(2, "0") || "—"}
                </span>
              </h2>
              <p style={h2SubStyle}>
                {currentDraw?.numbers?.length
                  ? `Resultado: ${currentDraw.numbers.slice(0, 5).map((n) => n.toString().padStart(2, "0")).join(" - ")}...`
                  : "Sorteo pendiente o sin datos"}
              </p>
            </div>
            <Button3D
              variant="primary" size="md"
              onClick={() => fetchPrediction(selectedTurno)}
              disabled={loading[selectedTurno]} loading={loading[selectedTurno]}
            >
              {predictions[selectedTurno] ? "Actualizar" : "Generar Pronóstico"}
            </Button3D>
          </div>

          {loading[selectedTurno] ? (
            <div style={{ ...glassPanel, textAlign: "center", padding: "32px" }}>
              <div style={loadingStyle} />
              <p style={{ color: "#94a3b8" }}>Calculando 20 factores estadísticos...</p>
            </div>
          ) : predictions[selectedTurno] ? (
            <PredictionCardContent prediction={predictions[selectedTurno]} turno={selectedTurno} fecha={fecha} />
          ) : (
            <div style={{ ...glassPanel, ...centerBoxStyle }}>
              <p style={{ color: "#94a3b8", marginBottom: "16px" }}>
                Presiona "Generar Pronóstico" para calcular la predicción
                basada en 20 factores estadísticos para este turno.
              </p>
              <Button3D variant="primary" onClick={() => fetchPrediction(selectedTurno)}>
                Generar Pronóstico
              </Button3D>
            </div>
          )}

          <div style={{ ...glassPanel, marginTop: "24px" }}>
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "18px", fontWeight: 800, marginBottom: "16px" }}>
              Navegación Rápida
            </h3>
            <div style={navGridStyle}>
              {TURNOS_ORDER.map((turno) => (
                <Button3D
                  key={turno}
                  variant={selectedTurno === turno ? "primary" : "ghost"}
                  size="sm" fullWidth
                  onClick={() => handleTurnoChange(turno)}
                >
                  {TURNOS_LABELS[turno]}
                </Button3D>
              ))}
            </div>
          </div>

          {Object.keys(predictions).length > 0 && (
            <div style={{ marginTop: "24px" }}>
              <TurnoSummary
                predictions={Object.entries(predictions).map(([turno, p]) => ({
                  number: p.cifras2,
                  confidence: p.confidence,
                  atrasoActual: p.atrasoActual,
                  trendAcceleration: p.trendAcceleration,
                  intervalDeviation: p.intervalDeviation,
                }))}
                lottery="Nacional"
                turno="Completo"
                dateStr={fecha}
              />
            </div>
          )}
        </div>
      </main>

      <footer style={footerStyle}>
        <div style={{ maxWidth: "800px", margin: "0 auto", padding: "0 16px" }}>
          <p style={footerTextStyle}>
            Quiniela IA — Análisis estadístico para entretenimiento. Juegue responsablemente.
          </p>
          <p style={{ ...footerTextStyle, marginTop: "8px" }}>
            <a href="/terminos" style={linkStyle}>Términos</a>
            · <a href="/privacidad" style={linkStyle}>Privacidad</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function PredictionCardContent({ prediction, turno, fecha }: { prediction: PredictionData; turno: string; fecha: string }) {
  const confidence = prediction.confidence || 0;
  const confidenceLabel = confidence > 75 ? "Alta" : confidence > 50 ? "Moderada" : "Baja";
  const confidenceColor = confidence > 75 ? "#34d399" : confidence > 50 ? "#fbbf24" : "#f87171";

  const stats = {
    atrasoActual: prediction.atrasoActual,
    trendAcceleration: prediction.trendAcceleration,
    intervalDeviation: prediction.intervalDeviation,
    confidenceScore: confidence,
  };

  return (
    <div style={{ ...glassPanel, ...glowEmerald }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "spaceBetween", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "40px" }}>🎯</span>
          <div>
            <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "28px", fontWeight: 800, margin: "0 0 4px", lineHeight: 1.1 }}>
              {prediction.cifras2}
              <span style={{ color: "#64748b", fontWeight: 400, fontSize: "16px", marginLeft: "8px" }}>
                2 Cifras
              </span>
            </p>
            <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>
              {confidence > 0 ? (
                <>Confianza: <span style={{ fontFamily: "'Space Grotesk', monospace", color: confidenceColor, fontWeight: 700 }}>{confidence.toFixed(1)}% ({confidenceLabel})</span></>
              ) : (
                <>Confianza: <span style={{ fontFamily: "'Space Grotesk', monospace", color: "#64748b" }}>s/d (sin consistencia calculada)</span></>
              )}
            </p>
          </div>
        </div>
        {(prediction.cifras3 || prediction.cifras4) && (
          <div style={{ textAlign: "right" }}>
            {prediction.cifras3 && <p style={{ fontSize: "13px" }}>3 Cifras: <span style={{ fontFamily: "'Space Grotesk', monospace", color: "#22d3ee" }}>{prediction.cifras3}</span></p>}
            {prediction.cifras4 && <p style={{ fontSize: "13px" }}>4 Cifras: <span style={{ fontFamily: "'Space Grotesk', monospace", color: "#fbbf24" }}>{prediction.cifras4}</span></p>}
            {prediction.redoblona && <p style={{ fontSize: "13px" }}>Redoblona: <span style={{ fontFamily: "'Space Grotesk', monospace", color: "#f472b6" }}>{prediction.redoblona.join(" - ")}</span></p>}
          </div>
        )}
      </div>

      <AnalysisParagraph
        number={prediction.cifras2}
        lottery="Nacional"
        turno={turno}
        dateStr={fecha}
        stats={stats}
      />

      {prediction.factores && prediction.factores.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <h4 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "12px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>
            Factores principales
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
            {prediction.factores.slice(0, 6).map((f, i) => (
              <div key={i} style={{ ...glassPanel, padding: "12px", textAlign: "center" }}>
                <p style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, marginBottom: "4px" }}>{f.name}</p>
                <p style={{ fontFamily: "'Space Grotesk', monospace", fontSize: "20px", fontWeight: 800, color: "#34d399", margin: 0 }}>{(f.value * 100).toFixed(1)}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...glassPanel, padding: "16px", textAlign: "center", color: "#64748b", fontSize: "11px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        Análisis basado en 20 factores estadísticos: frecuencia histórica, ausencia, recencia, tendencia, ciclos, Markov, co-ocurrencia, posiciones, patrones y Monte Carlo. Solo fines de entretenimiento.
      </div>
    </div>
  );
}