"use client";
import { useState, useEffect, useMemo } from "react";

const CHANNEL_ID = "UC3M26J9ge2LTG-uWJO_TqaQ";

const SORTeo_TIMES: Record<string, { h: number; m: number }> = {
  Previa: { h: 10, m: 15 },
  Primera: { h: 12, m: 0 },
  Matutina: { h: 15, m: 0 },
  Vespertina: { h: 18, m: 0 },
  Nocturna: { h: 21, m: 0 },
};

function getNowArgentina(): Date {
  const now = new Date();
  const argStr = now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" });
  return new Date(argStr);
}

function isLiveWindow(turno: string): boolean {
  const t = SORTeo_TIMES[turno];
  if (!t) return false;
  const now = getNowArgentina();
  const sorteoTime = new Date(now);
  sorteoTime.setHours(t.h, t.m, 0, 0);
  const diffMs = now.getTime() - sorteoTime.getTime();
  const diffMin = diffMs / 60000;
  return diffMin >= -5 && diffMin <= 20;
}

function getLiveStatus(turno: string): "live" | "next" | "offline" {
  const t = SORTeo_TIMES[turno];
  if (!t) return "offline";
  const now = getNowArgentina();
  const sorteoTime = new Date(now);
  sorteoTime.setHours(t.h, t.m, 0, 0);
  const diffMs = now.getTime() - sorteoTime.getTime();
  const diffMin = diffMs / 60000;

  if (diffMin >= -5 && diffMin <= 20) return "live";
  if (diffMin < -5) {
    const minsLeft = Math.abs(diffMin);
    if (minsLeft <= 60) return "next";
  }
  return "offline";
}

function getTimeUntilNext(turno: string): string {
  const t = SORTeo_TIMES[turno];
  if (!t) return "";
  const now = getNowArgentina();
  const sorteoTime = new Date(now);
  sorteoTime.setHours(t.h, t.m, 0, 0);
  if (sorteoTime.getTime() < now.getTime()) {
    sorteoTime.setDate(sorteoTime.getDate() + 1);
  }
  const diffMs = sorteoTime.getTime() - now.getTime();
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

interface LiveSorteoProps {
  turno: string;
}

export default function LiveSorteo({ turno }: LiveSorteoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const liveStatus = useMemo(() => getLiveStatus(turno), [turno, tick]);
  const isLiveNow = liveStatus === "live";
  const timeUntil = useMemo(() => getTimeUntilNext(turno), [turno, tick]);

  const liveUrl = `https://www.youtube.com/embed/live_stream?channel=${CHANNEL_ID}&autoplay=1&mute=1`;

  const statusColor = isLiveNow ? "#ef4444" : liveStatus === "next" ? "#f59e0b" : "#64748b";
  const statusText = isLiveNow ? "EN VIVO" : liveStatus === "next" ? `Próximo en ${timeUntil}` : "Fuera de horario";

  return (
    <div style={{ margin: "12px 0" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: 12,
          border: `1.5px solid ${isLiveNow ? "rgba(239,68,66,.5)" : "rgba(100,116,139,.3)"}`,
          background: isLiveNow
            ? "linear-gradient(135deg,rgba(239,68,66,.15),rgba(239,68,66,.05))"
            : "linear-gradient(135deg,rgba(30,41,59,.6),rgba(15,23,42,.4))",
          color: isLiveNow ? "#fca5a5" : "#94a3b8",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "'Inter',sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          transition: ".2s",
        }}
      >
        <span style={{ fontSize: 16 }}>{isOpen ? "⏹" : "▶"}</span>
        <span>Sorteo en Vivo</span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: 20,
            background: `${statusColor}22`,
            border: `1px solid ${statusColor}55`,
            fontSize: 10,
            fontWeight: 800,
            color: statusColor,
            letterSpacing: 0.5,
          }}
        >
          {isLiveNow && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#ef4444",
                animation: "pulse 1.5s infinite",
              }}
            />
          )}
          {statusText}
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            marginTop: 8,
            borderRadius: 12,
            overflow: "hidden",
            border: "1.5px solid rgba(100,116,139,.25)",
            background: "#000",
            position: "relative",
          }}
        >
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
            <iframe
              src={liveUrl}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                border: "none",
              }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="Sorteo en Vivo - Lotería de la Ciudad"
            />
          </div>
          <div
            style={{
              padding: "8px 12px",
              background: "linear-gradient(135deg,rgba(15,23,42,.9),rgba(30,41,59,.9))",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 11, color: "#94a3b8" }}>
              📺 Lotería de la Ciudad de Buenos Aires
            </span>
            <a
              href={`https://www.youtube.com/@loteriadelaciudad/streams`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 10,
                color: "#60a5fa",
                textDecoration: "none",
              }}
            >
              Abrir en YouTube ↗
            </a>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
