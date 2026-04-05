c = open("app/predictions/page.tsx", encoding="utf-8").read()

# 1. Verificar que redoblona este bloqueada para free
idx = c.find('tab==="rdbl"')
rdbl_section = c[idx:idx+500]
print("Tiene lock en rdbl:", "!pr" in rdbl_section or "lk" in rdbl_section)

# 2. Agregar mes gratis al compartir - actualizar funcion share
old_share_box = """        <div className="shr">
          <div className="shr-t">Compartir Quiniela IA</div>
          <div className="shr-b">
            <button className="sbt wa" onClick={()=>share("whatsapp")}>WhatsApp</button>
            <button className="sbt fb" onClick={()=>share("facebook")}>Facebook</button>
            <button className="sbt tw" onClick={()=>share("twitter")}>X</button>
            <button className="sbt tg" onClick={()=>share("telegram")}>Telegram</button>
            <button className="sbt cp" onClick={()=>share("copy")}>Copiar link</button>
          </div>
        </div>"""

new_share_box = """        <div className="shr">
          <div className="shr-t">Compartir y ganar Premium gratis</div>
          <div style={{fontSize:11,color:"#25F4EE",background:"rgba(37,244,238,.08)",border:"1px solid rgba(37,244,238,.2)",borderRadius:20,padding:"5px 14px",marginBottom:12,textAlign:"center"}}>
            Compartí la app con amigos y gana 30 dias Premium gratis
          </div>
          <div className="shr-b">
            <button className="sbt wa" onClick={()=>share("whatsapp")}>WhatsApp</button>
            <button className="sbt fb" onClick={()=>share("facebook")}>Facebook</button>
            <button className="sbt tw" onClick={()=>share("twitter")}>X</button>
            <button className="sbt tg" onClick={()=>share("telegram")}>Telegram</button>
            <button className="sbt cp" onClick={()=>share("copy")}>Copiar link</button>
          </div>
          <div style={{fontSize:10,color:"#475569",marginTop:8,textAlign:"center"}}>
            Envia el comprobante de compartir por WhatsApp al {WA.split("?")[0].replace("https://wa.me/","+").replace("549","549 ")} y activamos tu mes gratis
          </div>
        </div>"""

if old_share_box in c:
    c = c.replace(old_share_box, new_share_box, 1)
    print("OK - compartir con mes gratis")
else:
    print("ERROR share box no encontrado")
    idx = c.find("shr-t")
    print(repr(c[idx:idx+100]))

# 3. Fix campanita - agregar tooltip
old_bell = """<button onClick={pedirNotificaciones} style={{padding:"5px 10px",borderRadius:7,border:"1px solid rgba(32,213,236,.2)",background:"transparent",color:"#20d5ec",fontSize:11,cursor:"pointer",fontFamily:"inherit"}} title="Activar notificaciones">"""
new_bell = """<button onClick={pedirNotificaciones} style={{padding:"5px 10px",borderRadius:7,border:"1px solid rgba(37,244,238,.2)",background:"transparent",color:"#25F4EE",fontSize:11,cursor:"pointer",fontFamily:"inherit"}} title="Tocar para activar notificaciones de resultados">"""

if old_bell in c:
    c = c.replace(old_bell, new_bell, 1)
    print("OK - campanita con tooltip mejorado")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
