"use client";
import { getEmoji } from "@/app/predictions/page";

interface SavedCardProps {
  p: any;
  pr: boolean;
  userRole: string;
  index: number;
}

export function SavedCard({ p, pr, userRole, index }: SavedCardProps) {
  const tieneAciertos = p.aciertos && p.aciertos.length > 0;
  const fecha = p.date || p.fecha;
  const fechaValida = fecha && !isNaN(Date.parse(fecha));
  const titulo = fechaValida 
    ? `${p.turno} — ${new Date(fecha + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`
    : `${p.turno} — ${fecha || "Sin fecha"}`;
  
  const nums2: string[] = Array.isArray(p.numeros) 
    ? p.numeros 
    : (typeof p.numeros === "object" && p.numeros?.["2"] ? p.numeros["2"] : []);
  const nums3: string[] = Array.isArray(p.numeros_3) 
    ? p.numeros_3 
    : (typeof p.numeros === "object" && p.numeros?.["3"] ? p.numeros["3"] : []);
  const nums4: string[] = Array.isArray(p.numeros_4) 
    ? p.numeros_4 
    : (typeof p.numeros === "object" && p.numeros?.["4"] ? p.numeros["4"] : []);

  return (
    <div key={index} className={`saved-card ${tieneAciertos ? "saved-card-success" : ""}`}>
      <div className="saved-card-header">
        <div className="saved-card-title">{titulo}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>{nums2.length} nums</span>
          {p.resultado && p.resultado.length > 0 ? (
            <div className={`saved-card-status ${p.acerto ? "hit" : "miss"}`}>
              {p.acerto ? `📊 ${p.aciertos.length} coincidencia(s)` : "Sin coincidencias"}
            </div>
          ) : (
            <div className="saved-card-status miss">⏳ Esperando resultado</div>
          )}
        </div>
      </div>
      <div className="saved-numbers">
        {nums2.map((n: string, j: number) => {
          const ac = p.aciertos?.some((a: any) => a.numero === n);
          return (
            <span key={j} className={`saved-number ${ac ? "hit" : ""}`}>
              {n}
            </span>
          );
        })}
      </div>
      {(pr || userRole === "admin") && nums3.length > 0 && (
        <div style={{ marginTop: 8, padding: "6px 0", borderTop: "1px solid rgba(255,255,255,.06)" }}>
          <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, marginBottom: 4 }}>
            🔢 3 CIFRAS {p.aciertos_3?.length > 0 && <span style={{color:"#22c55e"}}>✓ {p.aciertos_3.length} coincidencia{p.aciertos_3.length > 1 ? "s" : ""}</span>}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {nums3.map((n: string, j: number) => {
              const hit3 = p.aciertos_3?.some((a: any) => a.numero === n);
              return (
                <span key={j} style={{ padding: "3px 7px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                  background: hit3 ? "rgba(34,197,94,.2)" : "rgba(245,158,11,.12)",
                  color: hit3 ? "#22c55e" : "#fbbf24",
                  border: hit3 ? "1px solid rgba(34,197,94,.4)" : "1px solid rgba(245,158,11,.2)" }}>{n}</span>
              );
            })}
          </div>
        </div>
      )}
      {(pr || userRole === "admin") && nums4.length > 0 && (
        <div style={{ marginTop: 8, padding: "6px 0", borderTop: "1px solid rgba(255,255,255,.06)" }}>
          <div style={{ fontSize: 10, color: "#a855f7", fontWeight: 700, marginBottom: 4 }}>
            🔢 4 CIFRAS {p.aciertos_4?.length > 0 && <span style={{color:"#22c55e"}}>✓ {p.aciertos_4.length} coincidencia{p.aciertos_4.length > 1 ? "s" : ""}</span>}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {nums4.map((n: string, j: number) => {
              const hit4 = p.aciertos_4?.some((a: any) => a.numero === n);
              return (
                <span key={j} style={{ padding: "3px 7px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                  background: hit4 ? "rgba(34,197,94,.2)" : "rgba(168,85,247,.12)",
                  color: hit4 ? "#22c55e" : "#c084fc",
                  border: hit4 ? "1px solid rgba(34,197,94,.4)" : "1px solid rgba(168,85,247,.2)" }}>{n}</span>
              );
            })}
          </div>
        </div>
      )}
      {p.resultado_original && p.resultado_original.length > 0 && (
        <div className="saved-results" style={{marginTop:8}}>
          <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>RESULTADOS OFICIALES ({p.resultado_original.length} números):</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
            {p.resultado_original.map((n:any,idx:number) => {
              const n4 = String(Number(n) % 10000).padStart(4, "0")
              const n3 = String(Number(n) % 1000).padStart(3, "0")
              const n2 = String(Number(n) % 100).padStart(2, "0")
              const hit4 = p.aciertos_4?.some((a:any) => a.numero === n4)
              const hit3 = p.aciertos_3?.some((a:any) => a.numero === n3)
              const hit2 = p.aciertos_2?.some((a:any) => a.numero === n2)
              const isHit = hit4 || hit3 || hit2
              const hitType = hit4 ? "4" : hit3 ? "3" : hit2 ? "2" : null
              return (
                <span key={idx} style={{
                  padding:"4px 7px",borderRadius:6,fontSize:11,fontWeight:700,
                  background: isHit
                    ? hitType === "4" ? "rgba(34,197,94,0.25)"
                    : hitType === "3" ? "rgba(96,165,250,0.2)"
                    : "rgba(168,85,247,0.2)"
                    : "rgba(255,255,255,0.05)",
                  color: isHit
                    ? hitType === "4" ? "#22c55e"
                    : hitType === "3" ? "#60a5fa"
                    : "#c4b5fd"
                    : "#64748b",
                  border: isHit
                    ? hitType === "4" ? "1px solid rgba(34,197,94,0.5)"
                    : hitType === "3" ? "1px solid rgba(96,165,250,0.4)"
                    : "1px solid rgba(168,85,247,0.4)"
                    : "1px solid rgba(255,255,255,0.08)"
                }}>
                  {n4}
                </span>
              );
            })}
          </div>
          <div style={{display:"flex",gap:10,marginTop:6,fontSize:9,color:"#64748b"}}>
            <span><span style={{color:"#c4b5fd"}}>●</span> 2 cifras</span>
            <span><span style={{color:"#60a5fa"}}>●</span> 3 cifras</span>
            <span><span style={{color:"#22c55e"}}>●</span> 4 cifras</span>
          </div>
        </div>
      )}
      {p.aciertos?.length > 0 && (
        <div className="saved-results">
          {p.aciertos.map((a: any) => (
            <div key={a.numero} style={{color:"#22c55e",fontSize:11}}>
              🎉 {a.numero} → Puesto {a.puesto}
            </div>
          ))}
        </div>
      )}
      {p.aciertos_3?.length > 0 && (
        <div className="saved-results">
          {p.aciertos_3.map((a: any) => (
            <div key={a.numero} style={{color:"#60a5fa",fontSize:11}}>
              🎯 {a.numero} (3 cifras) → Puesto {a.puesto}
            </div>
          ))}
        </div>
      )}
      {p.aciertos_4?.length > 0 && (
        <div className="saved-results">
          {p.aciertos_4.map((a: any) => (
            <div key={a.numero} style={{color:"#22c55e",fontSize:11}}>
              💎 {a.numero} (4 cifras) → Puesto {a.puesto}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}