"use client"
import { useState, useEffect } from "react"

const EMOJIS: Record<string, string> = {
  "00": "🥚", "01": "💧", "02": "🧒", "03": "⛪", "04": "🛏️", "05": "🐱", "06": "🐶", "07": "🔫", "08": "🔥", "09": "🏞️",
  "10": "🥛", "11": "🏏", "12": "💂", "13": "🍀", "14": "🥴", "15": "👧", "16": "💍", "17": "😭", "18": "🩸", "19": "🐟",
  "20": "🥳", "21": "👩", "22": "🤪", "23": "🦋", "24": "🐴", "25": "🐔", "26": "⛪", "27": "🪮", "28": "⛰️", "29": "🧔",
  "30": "🌹", "31": "💡", "32": "💎", "33": "✝️", "34": "👤", "35": "🐦", "36": "🌰", "37": "🌳", "38": "🪨", "39": "🌧️",
  "40": "👨‍⚖️", "41": "🔪", "42": "👟", "43": "🐸", "44": "🚓", "45": "🍷", "46": "🍅", "47": "⚰️", "48": "🗣️", "49": "🥩",
  "50": "🍞", "51": "🪚", "52": "🤱", "53": "⛵", "54": "🐄", "55": "🎶", "56": "📉", "57": "🧙‍♂️", "58": "🌊", "59": "🪴",
  "60": "🇻🇦", "61": "🔫", "62": "🌊", "63": "👰", "64": "😭", "65": "🥘", "66": "🕸️", "67": "🐍", "68": "🧒", "69": "👺",
  "70": "💀", "71": "💩", "72": "😲", "73": "🏥", "74": "🧔🏿", "75": "🤡", "76": "🔥", "77": "🦵", "78": "💃", "79": "🥷",
  "80": "🏆", "81": "⚽", "82": "🎱", "83": "🎾", "84": "⚾", "85": "🏐", "86": "🏉", "87": "🎳", "88": "🪀", "89": "🏓",
  "90": "📺", "91": "📻", "92": "🎤", "93": "🎼", "94": "🎷", "95": "🎸", "96": "🎺", "97": "🎻", "98": "🥁", "99": "🪗",
}

function getEmoji(num: string): string {
  return EMOJIS[String(num).padStart(2, "0")] || "❓"
}

interface NumberGridProps {
  predictions: any[];
  ranking: any[];
  dg: number;
  pr: boolean;
  guestMode: boolean;
  userRole: string;
  onNumberClick: (num: any) => void;
  onPaywall: () => void;
  onLogin: () => void;
}

export default function NumberGrid({
  predictions, ranking, dg, pr, guestMode, userRole,
  onNumberClick, onPaywall, onLogin
}: NumberGridProps) {
  const isBlurred = guestMode || (userRole === "free" && dg > 2)

  return (
    <div style={{ position: "relative" }}>
      <div
        className="g5"
        style={isBlurred ? { filter: "blur(8px)", userSelect: "none", pointerEvents: "none" } : {}}
      >
        {predictions.slice(0, 10).map((p: any, i: number) => {
          const r = ranking?.find((r: any) => r.numero === p.numero)
          const isCabeza = i === 0
          const post = r?.bayesianPosterior ? (r.bayesianPosterior * 100).toFixed(2) + "%" : ""
          return (
            <div className="cd" key={i} onClick={() => onNumberClick(r || p)} style={{ cursor: "pointer", position: "relative" }}>
              {isCabeza && <span className="cabeza-badge">CABEZA</span>}
              <div className="cr2">#{i + 1}</div>
              <div className="ce">{getEmoji(p.numero)}</div>
              <div className="cn">{p.numero}</div>
              <div className="cs">{p.significado}</div>
              <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 2,
                  width: r?.score ? Math.min(100, (r.score || 0) * 100) + "%" : "0%",
                  background: "linear-gradient(90deg,#a855f7,#ec4899)"
                }} />
              </div>
              <div style={{ fontSize: 9, color: "#a78bfa", marginTop: 3, fontWeight: 600 }}>
                {r?.score ? (r.score * 100).toFixed(0) + "%" : ""}
              </div>
              {post && <div style={{ fontSize: 7, color: "#22c55e", marginTop: 2, fontWeight: 700 }}>Post: {post}</div>}
            </div>
          )
        })}
      </div>
      {userRole === "free" && dg > 2 && (
        <div
          style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.4)", borderRadius: 14,
            cursor: "pointer", zIndex: 10
          }}
          onClick={() => guestMode ? onLogin() : onPaywall()}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>{guestMode ? "👤" : "🧠"}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", marginBottom: 4 }}>
            {guestMode ? "Creá tu cuenta gratis" : "Desbloquear 3 y 4 cifras"}
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8" }}>
            {guestMode ? "Para acceder a predicciones completas" : "Con Premium tenés acceso completo"}
          </div>
        </div>
      )}
    </div>
  )
}
