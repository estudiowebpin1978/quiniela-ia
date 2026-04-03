c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Mejorar legibilidad de cards de numeros
c = c.replace(
    ".cn{font-size:clamp(22px,5vw,32px);font-weight:900;background:linear-gradient(135deg,#ffb3c1,#ff2d55);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1;margin-bottom:4px;letter-spacing:-1px}",
    ".cn{font-size:clamp(24px,6vw,36px);font-weight:900;background:linear-gradient(135deg,#ffb3c1,#ff2d55);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1;margin-bottom:5px;letter-spacing:-1px}"
)

# Significado mas legible
c = c.replace(
    ".cs{font-size:9px;color:#ff9999;font-weight:500;padding:0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.2px}",
    ".cs{font-size:10px;color:#ffb3bf;font-weight:600;padding:0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.2px}"
)

# Rank mas visible
c = c.replace(
    ".cr2{position:absolute;top:4px;left:5px;font-size:7px;color:#475569;font-weight:700}",
    ".cr2{position:absolute;top:4px;left:5px;font-size:9px;color:#94a3b8;font-weight:800}"
)

# Titulo seccion mas legible
c = c.replace(
    ".sec{font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 10px;display:flex;align-items:center;gap:8px}",
    ".sec{font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 10px;display:flex;align-items:center;gap:8px}"
)

# Mejorar tabs mas legibles
c = c.replace(
    ".tb{flex:1;min-width:80px;padding:10px 6px;text-align:center;border-radius:9px;border:none;background:transparent;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:'Inter',sans-serif;transition:.15s;letter-spacing:.2px}",
    ".tb{flex:1;min-width:80px;padding:11px 6px;text-align:center;border-radius:9px;border:none;background:transparent;color:#64748b;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;font-family:'Inter',sans-serif;transition:.15s;letter-spacing:.2px}"
)

# Mejorar ibox mas legible
c = c.replace(
    ".ibox{background:rgba(255,45,85,.05);border:1px solid rgba(255,45,85,.15);border-radius:10px;padding:10px 14px;font-size:11px;color:#94a3b8;line-height:1.8;margin-top:10px}",
    ".ibox{background:rgba(255,45,85,.05);border:1px solid rgba(255,45,85,.15);border-radius:10px;padding:12px 14px;font-size:12px;color:#94a3b8;line-height:1.8;margin-top:10px}"
)

# Mover tips DESPUES de predicciones - verificar orden
# Tips debe estar DESPUES del bloque de predicciones (g5)
# Buscar si tips esta antes o despues
idx_tips = c.find('<div className="tips">')
idx_g5 = c.find('<div className="g5">')
print(f"tips en: {idx_tips}, g5 en: {idx_g5}")
print(f"Tips despues de predicciones: {idx_tips > idx_g5}")

# Mejorar hero label sorteo
c = c.replace(
    '<div style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:8,textAlign:"center"}}>Elegí el sorteo a analizar</div>',
    '<div style={{fontSize:13,fontWeight:700,color:"#94a3b8",marginBottom:8,textAlign:"center"}}>🎯 Elegí el sorteo que querés analizar:</div>'
)

# Mejorar boton generar
c = c.replace(
    '{ld?"⏳ Analizando...":"⚡ Generar Prediccion"}',
    '{ld?"⏳ Analizando datos...":"⚡ Generar Predicción Ahora"}'
)

# Mejorar hint inicial
c = c.replace(
    'Selecciona el sorteo y apreta <strong>Generar Prediccion</strong><br/>Motor estadistico con datos reales de los ultimos 365 dias',
    '👆 Seleccioná el sorteo de arriba y apretá<br/><strong>⚡ Generar Predicción Ahora</strong><br/><span style={{fontSize:11,color:"#475569"}}>Motor estadístico con datos reales actualizados</span>'
)

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
print("OK predictions")
