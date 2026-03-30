c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Mejorar la funcion de notificaciones para mostrar resultado real
old = """  async function pedirNotificaciones(){
    if(!("Notification" in window))return
    const perm = await Notification.requestPermission()
    if(perm==="granted"){
      alert("Notificaciones activadas! Te avisaremos cuando salgan los resultados de cada sorteo.")
    }
  }"""

new = """  async function pedirNotificaciones(){
    if(!("Notification" in window)){alert("Tu navegador no soporta notificaciones");return}
    const perm = await Notification.requestPermission()
    if(perm==="granted"){
      localStorage.setItem("notif_enabled","1")
      new Notification("Quiniela IA activado!", {
        body: "Te avisaremos cuando salgan los resultados de cada sorteo.",
        icon: "/icon-192.png"
      })
    }
  }
  function mostrarNotifResultado(turno:string, numeros:string[], acertos:string[]){
    if(!("Notification" in window)||Notification.permission!=="granted")return
    const msg = acertos.length>0
      ? "Acertaste "+acertos.length+" numero(s)! "+acertos.join(", ")+" en el "+turno
      : "Resultados del "+turno+" disponibles. Genera nueva prediccion."
    new Notification("Quiniela IA - "+turno, {body:msg, icon:"/icon-192.png"})
  }"""

if old in c:
    c = c.replace(old, new, 1)
    print("OK - notificaciones mejoradas")
else:
    print("buscando...")
    idx = c.find("pedirNotificaciones")
    print(repr(c[idx:idx+100]))

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
