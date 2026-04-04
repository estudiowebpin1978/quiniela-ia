c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Agregar estado para calculadora
c = c.replace(
    "const [controlando,setControlando]=useState(false)",
    "const [controlando,setControlando]=useState(false)\n  const [showCalc,setShowCalc]=useState(false)\n  const [apCalc,setApCalc]=useState(250)\n  const [rdblCalc,setRdblCalc]=useState(1000)"
)

# Agregar calculadora CSS
old_css_end = ".dc{margin-top:12px;font-size:9px;color:#374151;line-height:1.6;text-align:center}"
new_css_end = """.dc{margin-top:12px;font-size:9px;color:#374151;line-height:1.6;text-align:center}
      .calc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px}
      .calc-card{border-radius:12px;padding:12px 10px;text-align:center}
      .calc-card-t{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
      .calc-card-v{font-size:16px;font-weight:900;margin-bottom:3px}
      .calc-card-s{font-size:9px;opacity:.7;line-height:1.5}"""

if old_css_end in c:
    c = c.replace(old_css_end, new_css_end, 1)
    print("OK CSS calc")

# Agregar boton y calculadora despues del boton controlar jugada
old_place = "{resultadoControl&&<div style={{background:resultadoControl.error"
new_calc = """{dn&&<button onClick={()=>setShowCalc(!showCalc)} style={{width:"100%",padding:"13px",borderRadius:13,border:"1.5px solid rgba(201,168,76,.3)",background:"rgba(201,168,76,.08)",color:"#c9a84c",fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"'Inter',sans-serif",marginBottom:8,boxShadow:"0 4px 0 rgba(100,80,0,.3)",transition:".1s"}}>
          {showCalc?"▲ Cerrar calculadora":"💰 Sugerencias de apuesta"}
        </button>}
        {showCalc&&dn&&<div style={{background:"rgba(201,168,76,.04)",border:"1.5px solid rgba(201,168,76,.2)",borderRadius:16,padding:"16px",marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:800,color:"#c9a84c",marginBottom:12,textAlign:"center"}}>Calculadora de premios estimados</div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{fontSize:11,color:"#94a3b8",minWidth:130}}>Apuesta por cifra: <strong style={{color:"#f0cc6e"}}>${apCalc.toLocaleString("es-AR")}</strong></div>
            <input type="range" min={100} max={2000} step={100} value={apCalc} onChange={(e:any)=>setApCalc(Number(e.target.value))} style={{flex:1,accentColor:"#c9a84c"}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <div style={{fontSize:11,color:"#94a3b8",minWidth:130}}>Apuesta redoblona: <strong style={{color:"#f0cc6e"}}>${rdblCalc.toLocaleString("es-AR")}</strong></div>
            <input type="range" min={200} max={5000} step={100} value={rdblCalc} onChange={(e:any)=>setRdblCalc(Number(e.target.value))} style={{flex:1,accentColor:"#c9a84c"}}/>
          </div>
          <div className="calc-grid">
            <div className="calc-card" style={{background:"rgba(255,45,85,.08)",border:"1px solid rgba(255,45,85,.2)"}}>
              <div className="calc-card-t" style={{color:"#ff6b81"}}>2 cifras</div>
              <div className="calc-card-v" style={{color:"#ff6b81"}}>${(apCalc*70+apCalc*7).toLocaleString("es-AR")}</div>
              <div className="calc-card-s" style={{color:"#ff9999"}}>si sale al 1ro<br/>Apuesta: ${(apCalc*2).toLocaleString("es-AR")}</div>
              <div className="calc-card-s" style={{color:"#ff9999",marginTop:4}}>${(apCalc*7).toLocaleString("es-AR")} del 2 al 10</div>
            </div>
            <div className="calc-card" style={{background:"rgba(32,213,236,.06)",border:"1px solid rgba(32,213,236,.18)"}}>
              <div className="calc-card-t" style={{color:"#20d5ec"}}>3 cifras PRO</div>
              <div className="calc-card-v" style={{color:"#20d5ec"}}>${Math.round((apCalc*600+apCalc*60)*0.721).toLocaleString("es-AR")}</div>
              <div className="calc-card-s" style={{color:"#7dd9d7"}}>si sale al 1ro*<br/>Apuesta: ${(apCalc*2).toLocaleString("es-AR")}</div>
              <div className="calc-card-s" style={{color:"#7dd9d7",marginTop:4}}>${(apCalc*60).toLocaleString("es-AR")} del 2 al 10</div>
            </div>
            <div className="calc-card" style={{background:"rgba(245,158,11,.06)",border:"1px solid rgba(245,158,11,.2)"}}>
              <div className="calc-card-t" style={{color:"#f59e0b"}}>4 cifras PRO</div>
              <div className="calc-card-v" style={{color:"#f59e0b"}}>${Math.round((apCalc*3500+apCalc*350)*0.721).toLocaleString("es-AR")}</div>
              <div className="calc-card-s" style={{color:"#fbbf24"}}>si sale al 1ro*<br/>Apuesta: ${(apCalc*2).toLocaleString("es-AR")}</div>
              <div className="calc-card-s" style={{color:"#fbbf24",marginTop:4}}>${(apCalc*350).toLocaleString("es-AR")} del 2 al 10</div>
            </div>
            <div className="calc-card" style={{background:"rgba(134,239,172,.06)",border:"1px solid rgba(134,239,172,.2)"}}>
              <div className="calc-card-t" style={{color:"#86efac"}}>Redoblona</div>
              <div className="calc-card-v" style={{color:"#86efac"}}>${(rdblCalc*70*7).toLocaleString("es-AR")}</div>
              <div className="calc-card-s" style={{color:"#bbf7d0"}}>par exacto<br/>Apuesta: ${rdblCalc.toLocaleString("es-AR")}</div>
            </div>
          </div>
          <div style={{fontSize:9,color:"#475569",marginTop:10,textAlign:"center",lineHeight:1.6}}>
            * Premios 3 y 4 cifras con descuento AFIP ~27.9%. Valores estimados, sujetos a prorrateo.
          </div>
        </div>}
        """
new_calc += "{resultadoControl&&<div style={{background:resultadoControl.error"

if old_place in c:
    c = c.replace(old_place, new_calc, 1)
    print("OK - calculadora agregada")
else:
    print("ERROR buscando lugar...")
    idx = c.find("resultadoControl&&")
    print(repr(c[idx:idx+60]))

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
