"use client";
import { useMemo } from "react";
import { getEmoji } from "@/app/predictions/page";

interface NumberCardProps {
  numero: string;
  significado: string;
  rank: number;
  score?: number;
  confianza?: number;
  bayesianPosterior?: number;
  isCabeza?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  post?: string;
}

export function NumberCard({ 
  numero, 
  significado, 
  rank, 
  score, 
  confianza, 
  bayesianPosterior,
  isCabeza = false, 
  onClick, 
  disabled = false,
  post 
}: NumberCardProps) {
  return useMemo(() => (
    <div 
      className="cd" 
      onClick={onClick} 
      style={{ cursor: onClick && !disabled ? "pointer" : "default", position: "relative" }}
      disabled={disabled}
    >
      {isCabeza && <span className="cabeza-badge">CABEZA</span>}
      <div className="cr2">#{rank}</div>
      <div className="ce">{getEmoji(numero)}</div>
      <div className="cn">{numero}</div>
      <div className="cs">{significado}</div>
      <div style={{
        marginTop: 6,
        height: 3,
        borderRadius: 2,
        background: "rgba(255,255,255,.06)",
        overflow: "hidden"
      }}>
        <div style={{
          height: "100%",
          borderRadius: 2,
          width: score ? Math.min(100, (score || 0) * 100) + "%" : "0%",
          background: "linear-gradient(90deg,#a855f7,#ec4899)"
        }}/>
      </div>
      <div style={{fontSize: 9, color: "#a78bfa", marginTop: 3, fontWeight: 600}}>
        {score ? (score * 100).toFixed(0) + "%" : ""}
      </div>
      {post && <div style={{fontSize: 7, color: "#22c55e", marginTop: 2, fontWeight: 700}}>Post: {post}</div>}
      {bayesianPosterior && <div style={{fontSize: 7, color: "#f472b6", marginTop: 2, fontWeight: 700}}>Bayes: {(bayesianPosterior * 100).toFixed(2)}%</div>}
    </div>
  ), [numero, significado, rank, score, confianza, bayesianPosterior, isCabeza, onClick, disabled, post]);
}