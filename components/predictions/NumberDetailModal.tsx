"use client";
import { useMemo } from "react";
import { getEmoji } from "@/app/predictions/page";

interface NumberDetailModalProps {
  numDetail: {
    numero: string;
    significado: string;
    score?: number;
    confianza?: number;
    frecuencia?: number;
    bayesianConfidence?: number;
    bayesianPosterior?: number;
    rank?: number;
    factores?: string[];
  } | null;
  numHistory: {
    trend?: { direction: "hot" | "cold" | "stable" };
    stats?: { vsExpected: number; expectedFrequency: number };
    gaps?: Record<string, number>;
    appearances?: Array<{ date: string; turno: string }>;
  } | null;
  numHistoryLoading: boolean;
  onClose: () => void;
} 

export function NumberDetailModal({ 
  numDetail, 
  numHistory, 
  numHistoryLoading, 
  onClose 
}: NumberDetailModalProps) {
  if (!numDetail) return null;

  return useMemo(() => (
    <div 
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"}}
      onClick={onClose}
    >
      <div style={{background:"var(--card)",borderRadius:16,padding:24,maxWidth:420,width:"100%",maxHeight:"90vh",overflowY:"auto"}} onClick={e => e.stopPropagation()}>
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:48,marginBottom:4}}>{getEmoji(numDetail.numero)}</div>
          <div style={{fontSize:36,fontWeight:900,background:"linear-gradient(180deg,#a855f7,#6366f1)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>{numDetail.numero}</div>
          <div style={{fontSize:14,color:"var(--dim)",marginTop:4}}>{numDetail.significado || "Sin significado"}</div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:16,flexWrap:"wrap"}}>
          <div style={{background:"rgba(168,85,247,.12)",borderRadius:10,padding:"8px 14px",textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:900,color:"#a855f7"}}>{numDetail.score ? (numDetail.score * 100).toFixed(0) : "—"}</div>
            <div style={{fontSize:9,color:"#a78bfa",fontWeight:700,textTransform:"uppercase"}}>Score</div>
          </div>
          <div style={{background:"rgba(99,102,241,.12)",borderRadius:10,padding:"8px 14px",textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:900,color:"#818cf8"}}>{numDetail.confianza || "—"}</div>
            <div style={{fontSize:9,color:"#a5b4fc",fontWeight:700,textTransform:"uppercase"}}>Confianza</div>
          </div>
          <div style={{background:"rgba(34,197,94,.12)",borderRadius:10,padding:"8px 14px",textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:900,color:"#4ade80"}}>{numDetail.frecuencia ?? "—"}</div>
            <div style={{fontSize:9,color:"#86efac",fontWeight:700,textTransform:"uppercase"}}>Frecuencia</div>
          </div>
          {numDetail.bayesianConfidence != null && (
            <div style={{background:"rgba(236,72,153,.12)",borderRadius:10,padding:"8px 14px",textAlign:"center"}}>
              <div style={{fontSize:18,fontWeight:900,color:"#f472b6"}}>{numDetail.bayesianConfidence}%</div>
              <div style={{fontSize:9,color:"#f9a8d4",fontWeight:700,textTransform:"uppercase"}}>Bayesian</div>
            </div>
          )}
        </div>

        {/* Historical Data Section */}
        {numHistory && !numHistoryLoading && (
          <div style={{borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:12,marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:800,color:"var(--dim)",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Historial del Número</div>
            
            {/* Trend indicator */}
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <div style={{flex:1,background:numHistory.trend?.direction === "hot" ? "rgba(239,68,68,.12)" : numHistory.trend?.direction === "cold" ? "rgba(59,130,246,.12)" : "rgba(255,255,255,.04)",borderRadius:8,padding:"8px 10px",textAlign:"center",border: `1px solid ${numHistory.trend?.direction === "hot" ? "rgba(239,68,68,.2)" : numHistory.trend?.direction === "cold" ? "rgba(59,130,246,.2)" : "rgba(255,255,255,.06)"}`}}>
                <div style={{fontSize:16,fontWeight:900,color:numHistory.trend?.direction === "hot" ? "#f87171" : numHistory.trend?.direction === "cold" ? "#60a5fa" : "#94a3b8"}}>{numHistory.trend?.direction === "hot" ? "🔥 CALIENTE" : numHistory.trend?.direction === "cold" ? "❄️ FRÍO" : "➡️ ESTABLE"}</div>
                <div style={{fontSize:9,color:"var(--dim)"}}>Tendencia últimos 30 sorteos</div>
              </div>
              <div style={{flex:1,background:"rgba(255,255,255,.04)",borderRadius:8,padding:"8px 10px",textAlign:"center",border:"1px solid rgba(255,255,255,.06)"}}>
                <div style={{fontSize:16,fontWeight:900,color:numHistory.stats?.vsExpected > 0 ? "#4ade80" : "#f87171"}}>{numHistory.stats?.vsExpected > 0 ? "+" : ""}{numHistory.stats?.vsExpected}%</div>
                <div style={{fontSize:9,color:"var(--dim)"}}>vs esperado ({numHistory.stats?.expectedFrequency}%)</div>
              </div>
            </div>

            {/* Gaps per turno */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,color:"var(--dim)",fontWeight:700,marginBottom:6}}>Ausencia por turno:</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {Object.entries(numHistory.gaps || {}).map(([t, g]) => (
                  <div key={t} style={{background:(g as number) > 10 ? "rgba(239,68,68,.1)" : "rgba(255,255,255,.04)",borderRadius:6,padding:"4px 8px",fontSize:10}}>
                    <span style={{fontWeight:700,color:"var(--text)"}}>{t.substring(0,4)}</span>{" "}
                    <span style={{color:(g as number) > 10 ? "#f87171" : "#94a3b8",fontWeight:700}}>{String(g)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent appearances */}
            {numHistory.appearances?.length > 0 && (
              <div>
                <div style={{fontSize:10,color:"var(--dim)",fontWeight:700,marginBottom:6}}>Últimas apariciones:</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {numHistory.appearances.slice(0, 12).map((a: any, i: number) => (
                    <div key={i} style={{background:"rgba(168,85,247,.1)",borderRadius:6,padding:"3px 8px",fontSize:9,color:"#c4b5fd"}}>
                      {a.date.substring(5)} <span style={{color:"#64748b"}}>{a.turno.substring(0,4)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {numHistoryLoading && (
          <div style={{borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:12,marginBottom:12,textAlign:"center"}}>
            <div className="skeleton" style={{height:80,borderRadius:8,marginBottom:8}}/>
            <div className="skeleton" style={{height:40,borderRadius:8}}/>
          </div>
        )}

        <div style={{fontSize:11,color:"var(--dim)",lineHeight:1.8,borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:12}}>
          <strong style={{color:"var(--text)"}}>¿Por qué este número?</strong>
          <ul style={{margin:"8px 0 0",padding:"0 0 0 16px"}}>
            <li>Ranking <strong style={{color:"#a855f7"}}>#{numDetail.rank || "—"}</strong> en el análisis general</li>
            {numDetail.frecuencia != null && <li>Apareció <strong style={{color:"#4ade80"}}>{numDetail.frecuencia} veces</strong> en el histórico</li>}
            {numDetail.confianza != null && <li>Confianza del <strong style={{color:"#818cf8"}}>{numDetail.confianza}%</strong></li>}
            {numDetail.bayesianPosterior != null && <li>Posterior Bayesiano: <strong style={{color:"#f472b6"}}>{(numDetail.bayesianPosterior * 100).toFixed(3)}%</strong></li>}
            {numDetail.score != null && <li>Score compuesto: <strong style={{color:"#a855f7"}}>{(numDetail.score * 100).toFixed(1)}%</strong></li>}
            {numDetail.factores?.length > 0 && <li>Factores adicionales: {numDetail.factores.slice(0,3).join(", ")}{numDetail.factores.length > 3 ? "..." : ""}</li>}
          </ul>
        </div>
        <button onClick={onClose} style={{marginTop:16,width:"100%",padding:"10px",borderRadius:10,border:"none",background:"rgba(255,255,255,.06)",color:"var(--text)",fontWeight:700,cursor:"pointer",fontSize:12}}>Cerrar</button>
      </div>
    </div>
  ), [numDetail, numHistory, numHistoryLoading, onClose]);
}