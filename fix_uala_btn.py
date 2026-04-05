c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Agregar estado para pago Uala
c = c.replace(
    "const [showCalc,setShowCalc]=useState(false)",
    "const [showCalc,setShowCalc]=useState(false)\n  const [pagandoUala,setPagandoUala]=useState(false)"
)

# Agregar funcion pagar con Uala
fn_uala = """
  async function pagarUala(){
    if(!em){alert("Necesitas estar logueado");return}
    setPagandoUala(true)
    try{
      const r=await fetch("/api/pago-uala",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:em})})
      const d=await r.json()
      if(d.link){
        window.open(d.link,"_blank")
      }else{
        alert("Error generando link de pago: "+(d.error||"intenta por WhatsApp"))
      }
    }catch(e:any){alert("Error: "+e.message)}
    setPagandoUala(false)
  }
"""
c = c.replace("  async function controlarJugada(){", fn_uala + "  async function controlarJugada(){", 1)

# Reemplazar boton "Activar por WhatsApp" por boton Uala + WhatsApp en pay-box
old_pay_btn = """<a href={WA} target="_blank" rel="noopener noreferrer" className="btn3d btn-prem" style={{display:"inline-flex",width:"auto",padding:"12px 24px",textDecoration:"none",marginBottom:4}}>Enviar comprobante por WhatsApp</a>"""

new_pay_btn = """<button onClick={pagarUala} disabled={pagandoUala} className="btn3d btn-prem" style={{display:"inline-flex",width:"auto",padding:"12px 24px",marginBottom:8,border:"none",cursor:"pointer"}}>
            {pagandoUala?"Generando link...":"Pagar con Ualá — $10.000"}
          </button>
          <div style={{fontSize:11,color:"#475569",marginBottom:8}}>o transferi al alias:</div>
          <a href={WA} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,padding:"10px 20px",background:"#25D366",color:"#fff",borderRadius:10,fontSize:13,fontWeight:700,textDecoration:"none",marginBottom:4}}>
            WhatsApp — Enviar comprobante
          </a>"""

if old_pay_btn in c:
    c = c.replace(old_pay_btn, new_pay_btn, 1)
    print("OK - boton Uala agregado")
else:
    print("ERROR - buscando...")
    idx = c.find("Enviar comprobante por WhatsApp")
    print(repr(c[idx-50:idx+80]))

# Tambien en el lock de redoblona
old_lock_wa = '<a href={WA} target="_blank" rel="noopener noreferrer" className="uc" style={{marginTop:4}}>Activar por WhatsApp</a>'
new_lock_wa = """<button onClick={pagarUala} disabled={pagandoUala} style={{background:"linear-gradient(135deg,#25F4EE,#00c0b8)",color:"#000",border:"none",borderRadius:10,padding:"9px 16px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit",marginBottom:6}}>
                    {pagandoUala?"Generando...":"Pagar con Uala"}
                  </button>
                  <a href={WA} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#94a3b8",textDecoration:"none"}}>o envianos el comprobante por WhatsApp</a>"""

if old_lock_wa in c:
    c = c.replace(old_lock_wa, new_lock_wa, 1)
    print("OK - lock rdbl con Uala")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
