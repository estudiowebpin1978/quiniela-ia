c = open("app/predictions/page.tsx", encoding="utf-8").read()

# 1. Mover tips DESPUES de predicciones
# Extraer bloque tips
import re
tips_start = c.find('<div className="tips">')
tips_end = c.find('</div>\n          <div className="tbs">')
if tips_start > 0 and tips_end > 0:
    tips_block = c[tips_start:tips_end+7]
    # Eliminar de posicion actual
    c = c.replace(tips_block, "", 1)
    # Insertar despues del bloque de predicciones (despues del ibox)
    c = c.replace(
        '<div style={{display:"flex",gap:8,marginTop:10}}>',
        tips_block + '\n          <div style={{display:"flex",gap:8,marginTop:10}}>'
    , 1)
    print("OK - tips movidos despues de predicciones")
else:
    print("ERROR tips_start:", tips_start, "tips_end:", tips_end)

# 2. Mejorar tabs principales con emojis y colores 3D
old_tbs = """.tbs{display:flex;background:rgba(255,255,255,.03);border-radius:12px;padding:3px;margin-bottom:18px;gap:2px;overflow-x:auto}
      .tb{flex:1;min-width:80px;padding:11px 6px;text-align:center;border-radius:9px;border:none;background:transparent;color:#64748b;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;font-family:'Inter',sans-serif;transition:.15s;letter-spacing:.2px}
      .tb.on{background:linear-gradient(135deg,rgba(255,45,85,.18),rgba(204,0,51,.12));color:#ff6b81;border:1px solid rgba(255,45,85,.3);font-weight:700}"""
new_tbs = """.tbs{display:flex;gap:5px;margin-bottom:18px;overflow-x:auto;padding-bottom:2px}
      .tb{flex:1;min-width:72px;padding:11px 4px;text-align:center;border-radius:12px;border:none;font-family:'Inter',sans-serif;font-weight:800;font-size:11px;cursor:pointer;white-space:nowrap;transition:.1s;user-select:none;display:flex;flex-direction:column;align-items:center;gap:3px;box-shadow:0 4px 0 rgba(0,0,0,.4)}
      .tb:active{transform:translateY(3px);box-shadow:none}
      .tb-pred{background:linear-gradient(180deg,#1e1e2e,#12121e);color:#64748b;border:1.5px solid rgba(255,255,255,.08)}
      .tb-pred.on{background:linear-gradient(180deg,#ff2d55,#cc0033);color:#fff;border-color:#ff2d55;box-shadow:0 4px 0 #800020}
      .tb-rdbl{background:linear-gradient(180deg,#1e1e2e,#12121e);color:#64748b;border:1.5px solid rgba(255,255,255,.08)}
      .tb-rdbl.on{background:linear-gradient(180deg,#20d5ec,#00a8c8);color:#001a20;border-color:#20d5ec;box-shadow:0 4px 0 #006080}
      .tb-freq{background:linear-gradient(180deg,#1e1e2e,#12121e);color:#64748b;border:1.5px solid rgba(255,255,255,.08)}
      .tb-freq.on{background:linear-gradient(180deg,#a78bfa,#5b21b6);color:#fff;border-color:#a78bfa;box-shadow:0 4px 0 #2e1065}
      .tb-mis{background:linear-gradient(180deg,#1e1e2e,#12121e);color:#64748b;border:1.5px solid rgba(255,255,255,.08)}
      .tb-mis.on{background:linear-gradient(180deg,#22c55e,#15803d);color:#fff;border-color:#22c55e;box-shadow:0 4px 0 #064e24}
      .tb .tb-ico{font-size:16px}
      .tb .tb-lbl{font-size:10px}"""
if old_tbs in c:
    c = c.replace(old_tbs, new_tbs, 1)
    print("OK - tabs mejorados")
else:
    print("ERROR tabs no encontrado")

# 3. Actualizar JSX de tabs con emojis y clases
old_tabs_jsx = """          <div className="tbs">
            <button className={"tb"+(tab==="pred"?" on":"")} onClick={()=>setTab("pred")}>Predicciones</button>
            <button className={"tb"+(tab==="rdbl"?" on":"")} onClick={()=>setTab("rdbl")}>Redoblona</button>
            <button className={"tb"+(tab==="freq"?" on":"")} onClick={()=>setTab("freq")}>Frecuencias</button>
            <button className={"tb"+(tab==="mis"?" on":"")} onClick={()=>setTab("mis")}>Mis preds</button>
          </div>"""
new_tabs_jsx = """          <div className="tbs">
            <button className={"tb tb-pred"+(tab==="pred"?" on":"")} onClick={()=>setTab("pred")}><span className="tb-ico">🎯</span><span className="tb-lbl">Predicc.</span></button>
            <button className={"tb tb-rdbl"+(tab==="rdbl"?" on":"")} onClick={()=>setTab("rdbl")}><span className="tb-ico">🎲</span><span className="tb-lbl">Redoblona</span></button>
            <button className={"tb tb-freq"+(tab==="freq"?" on":"")} onClick={()=>setTab("freq")}><span className="tb-ico">🔥</span><span className="tb-lbl">Frecuencias</span></button>
            <button className={"tb tb-mis"+(tab==="mis"?" on":"")} onClick={()=>setTab("mis")}><span className="tb-ico">📋</span><span className="tb-lbl">Mis preds</span></button>
          </div>"""
if old_tabs_jsx in c:
    c = c.replace(old_tabs_jsx, new_tabs_jsx, 1)
    print("OK - tabs JSX con emojis")
else:
    print("ERROR tabs JSX")

# 4. Mejorar tabs de digitos 2/3/4 cifras con colores 3D
old_dtabs = """.dtabs{display:flex;gap:5px;margin-bottom:14px}
      .dk{flex:1;padding:9px 4px;text-align:center;border:1.5px solid rgba(255,255,255,.08);border-radius:10px;background:linear-gradient(180deg,#1e1e2e,#12121e);color:#475569;font-size:11px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;position:relative;box-shadow:0 3px 0 #050508;transition:.1s;user-select:none}
      .dk:active{transform:translateY(2px);box-shadow:none}
      .dk.on{border-color:#ff2d55;color:#ff6b81;background:linear-gradient(180deg,#2a0010,#1a0008);box-shadow:0 3px 0 #800020}
      .pbdg{position:absolute;top:-7px;right:3px;background:linear-gradient(135deg,#20d5ec,#00a8c8);color:#001a20;font-size:7px;font-weight:800;padding:1px 5px;border-radius:8px}"""
new_dtabs = """.dtabs{display:flex;gap:6px;margin-bottom:14px}
      .dk{flex:1;padding:12px 4px;text-align:center;border-radius:12px;font-family:'Inter',sans-serif;font-weight:800;font-size:13px;cursor:pointer;position:relative;transition:.1s;user-select:none;border:none;box-shadow:0 5px 0 rgba(0,0,0,.5)}
      .dk:active{transform:translateY(4px);box-shadow:none}
      .dk-2{background:linear-gradient(180deg,#ff2d55,#cc0033);color:#fff;box-shadow:0 5px 0 #800020}
      .dk-3{background:linear-gradient(180deg,#20d5ec,#00a8c8);color:#001a20;box-shadow:0 5px 0 #006080}
      .dk-4{background:linear-gradient(180deg,#f59e0b,#d97706);color:#1a0e00;box-shadow:0 5px 0 #7c3f00}
      .dk.on{filter:brightness(1.15);box-shadow:0 2px 0 rgba(0,0,0,.5)}
      .dk:not(.on){opacity:.5}
      .pbdg{position:absolute;top:-8px;right:3px;background:#fff;color:#001a20;font-size:7px;font-weight:800;padding:2px 6px;border-radius:8px}"""
if old_dtabs in c:
    c = c.replace(old_dtabs, new_dtabs, 1)
    print("OK - dtabs mejorados")
else:
    print("ERROR dtabs")

# 5. Actualizar JSX de dtabs con clases nuevas
old_dtabs_jsx = """            <div className="dtabs">
              {[2,3,4].map(d=>(<button key={d} className={"dk"+(dg===d?" on":"")} onClick={()=>setDg(d)}>{d>2&&<span className="pbdg">PRO</span>}{d} digitos</button>))}
            </div>"""
new_dtabs_jsx = """            <div className="dtabs">
              <button className={"dk dk-2"+(dg===2?" on":"")} onClick={()=>setDg(2)}>2 cifras</button>
              <button className={"dk dk-3"+(dg===3?" on":"")} onClick={()=>setDg(3)}><span className="pbdg">PRO</span>3 cifras</button>
              <button className={"dk dk-4"+(dg===4?" on":"")} onClick={()=>setDg(4)}><span className="pbdg">PRO</span>4 cifras</button>
            </div>"""
if old_dtabs_jsx in c:
    c = c.replace(old_dtabs_jsx, new_dtabs_jsx, 1)
    print("OK - dtabs JSX")
else:
    print("ERROR dtabs JSX")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
