"use client";
import { useMemo } from "react";

interface BadgesProps {
  misPreds: any[];
  misSummary: {
    totalAciertos: number;
    totalWithHits: number;
    successRate: number;
  };
}

export function Badges({ misPreds, misSummary }: BadgesProps) {
  return useMemo(() => {
    const badges: {icon: string; label: string; color: string}[] = [];
    if (misPreds.length >= 1) badges.push({icon:"🙌",label:"Primer análisis",color:"#4ade80"});
    if (misSummary.totalAciertos >= 1) badges.push({icon:"🎯",label:"Primera coincidencia",color:"#f59e0b"});
    if (misPreds.length >= 10) badges.push({icon:"💎",label:"10 análisis",color:"#a855f7"});
    if (misPreds.length >= 30) badges.push({icon:"🏆",label:"30 análisis",color:"#f472b6"});
    if (misSummary.totalWithHits >= 3) badges.push({icon:"🔥",label:misSummary.totalWithHits + " con coincidencias",color:"#ef4444"});
    if (misSummary.successRate >= 50) badges.push({icon:"⭐",label:"+50% coincidencias",color:"#f59e0b"});
    if (badges.length === 0) return null;
    
    return (
      <div style={{marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:800,color:"var(--dim)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>🏅 Logros desbloqueados</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {badges.map((b,i) => (
            <span key={i} style={{
              padding:"5px 10px",borderRadius:8,fontSize:11,fontWeight:700,
              background: b.color + "18",
              border: "1px solid " + b.color + "35",
              color: b.color
            }}>
              {b.icon} {b.label}
            </span>
          ))}
        </div>
      </div>
    );
  }, [misPreds, misSummary]);
}