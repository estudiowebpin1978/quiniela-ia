c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Agregar solicitud de notificaciones push
push_fn = """
  async function pedirNotificaciones(){
    if(!("Notification" in window))return
    const perm = await Notification.requestPermission()
    if(perm==="granted"){
      alert("Notificaciones activadas! Te avisaremos cuando salgan los resultados de cada sorteo.")
    }
  }
"""
c = c.replace("  async function gen(){", push_fn + "  async function gen(){", 1)

# Agregar boton de notificaciones en el nav
c = c.replace(
    "{pr&&<a href=\"/admin\" className=\"nav-admin\">Admin</a>}",
    """{pr&&<a href="/admin" className="nav-admin">Admin</a>}
          <button onClick={pedirNotificaciones} style={{padding:"5px 10px",borderRadius:7,border:"1px solid rgba(32,213,236,.2)",background:"transparent",color:"#20d5ec",fontSize:11,cursor:"pointer",fontFamily:"inherit"}} title="Activar notificaciones">🔔</button>"""
)

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
print("OK" if "pedirNotificaciones" in open("app/predictions/page.tsx", encoding="utf-8").read() else "ERROR")
