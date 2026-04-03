c = open("app/login/page.tsx", encoding="utf-8").read()

# Mejorar tab de crear cuenta con emoji y flecha
c = c.replace(
    '<button className={"tab"+(tab==="up"?" on":"")} onClick={()=>{setTab("up");setErr("");setOk("")}}>\n            Crear cuenta\n            <span className="tab-free">¡GRATIS!</span>\n          </button>',
    '<button className={"tab"+(tab==="up"?" on":"")} onClick={()=>{setTab("up");setErr("");setOk("")}}>\n            🆕 Crear cuenta\n            <span className="tab-free">¡GRATIS!</span>\n          </button>'
)

# Mejorar tab iniciar sesion con emoji
c = c.replace(
    '<button className={"tab"+(tab==="in"?" on":"")} onClick={()=>{setTab("in");setErr("");setOk("")}}>\n            Iniciar sesión\n          </button>',
    '<button className={"tab"+(tab==="in"?" on":"")} onClick={()=>{setTab("in");setErr("");setOk("")}}>\n            👆 Ya tengo cuenta\n          </button>'
)

# Mejorar descripcion de crear cuenta
c = c.replace(
    '{tab==="up"&&<p style={{fontSize:12,color:"#64748b",marginBottom:8,lineHeight:1.6,textAlign:"center"}}>Creá tu cuenta gratis y empezá a analizar las predicciones estadísticas de la quiniela.</p>}',
    '{tab==="up"&&<p style={{fontSize:12,color:"#64748b",marginBottom:8,lineHeight:1.6,textAlign:"center"}}>👇 Completá tus datos y empezá gratis ahora mismo.</p>}\n        {tab==="in"&&<p style={{fontSize:12,color:"#64748b",marginBottom:8,lineHeight:1.6,textAlign:"center"}}>👇 Ingresá tu email y contraseña para continuar.</p>}'
)

# Mejorar boton submit
c = c.replace(
    '{busy?"Verificando...":tab==="in"?"Ingresar →":"Crear cuenta gratis →"}',
    '{busy?"⏳ Verificando...":tab==="in"?"👆 Ingresar →":"🚀 Crear cuenta gratis →"}'
)

# Mejorar switch links
c = c.replace(
    '{tab==="up"?<>¿Ya tenés cuenta? <button onClick={()=>{setTab("in");setErr("");setOk("")}}>Iniciá sesión</button></>:<>¿No tenés cuenta? <button onClick={()=>{setTab("up");setErr("");setOk("")}}>Creala gratis</button></>}',
    '{tab==="up"?<>👆 ¿Ya tenés cuenta? <button onClick={()=>{setTab("in");setErr("");setOk("")}}>Tocá acá para ingresar</button></>:<>🆕 ¿No tenés cuenta? <button onClick={()=>{setTab("up");setErr("");setOk("")}}>Creala gratis acá</button></>}'
)

# Mejorar features con emojis mas descriptivos
c = c.replace(
    '<div className="feat"><span className="feat-ico">📊</span><div className="feat-text"><strong>Motor estadístico</strong>6 factores de análisis</div></div>',
    '<div className="feat"><span className="feat-ico">🧠</span><div className="feat-text"><strong>Motor estadístico</strong>6 factores de análisis real</div></div>'
)
c = c.replace(
    '<div className="feat"><span className="feat-ico">🎯</span><div className="feat-text"><strong>5 sorteos diarios</strong>Previa hasta Nocturna</div></div>',
    '<div className="feat"><span className="feat-ico">🎰</span><div className="feat-text"><strong>5 sorteos diarios</strong>Previa · Primera · Matutina · Vespertina · Nocturna</div></div>'
)
c = c.replace(
    '<div className="feat"><span className="feat-ico">🔥</span><div className="feat-text"><strong>Datos reales</strong>Actualizados automáticamente</div></div>',
    '<div className="feat"><span className="feat-ico">📡</span><div className="feat-text"><strong>Datos reales</strong>Se actualizan solos tras cada sorteo</div></div>'
)
c = c.replace(
    '<div className="feat"><span className="feat-ico">🤖</span><div className="feat-text"><strong>Análisis IA</strong>Groq + Motor estadístico</div></div>',
    '<div className="feat"><span className="feat-ico">🤖</span><div className="feat-text"><strong>Inteligencia Artificial</strong>Analiza patrones reales</div></div>'
)

# Mejorar badge
c = c.replace(
    '<div className="free-badge">✓ Crear cuenta es completamente GRATIS</div>',
    '<div className="free-badge">✅ Crear cuenta es 100% GRATIS — sin tarjeta</div>'
)

open("app/login/page.tsx", "w", encoding="utf-8").write(c)
print("OK login")
