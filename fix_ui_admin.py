# 1. Mejorar botones de sorteo
c = open("app/predictions/page.tsx", encoding="utf-8").read()

c = c.replace(
    ".sb{padding:12px 2px 9px;border-radius:13px;background:linear-gradient(180deg,#1a1a2e,#0d0d1f);color:#64748b;border:1.5px solid rgba(255,255,255,.08);box-shadow:0 5px 0 #03030a,0 6px 15px rgba(0,0,0,.4);cursor:pointer;font-family:'Inter',sans-serif;font-weight:700;font-size:11px;text-align:center;transition:.12s;display:flex;flex-direction:column;align-items:center;gap:4px;user-select:none;letter-spacing:.2px}",
    ".sb{padding:13px 4px 10px;border-radius:13px;background:linear-gradient(180deg,#1a1a2e,#0d0d1f);color:#94a3b8;border:1.5px solid rgba(255,255,255,.1);box-shadow:0 5px 0 #03030a,0 6px 15px rgba(0,0,0,.4);cursor:pointer;font-family:'Inter',sans-serif;font-weight:800;font-size:12px;text-align:center;transition:.12s;display:flex;flex-direction:column;align-items:center;gap:5px;user-select:none;letter-spacing:.2px}"
)

c = c.replace(
    ".sb .sh{font-size:8px;font-weight:500;opacity:.55}",
    ".sb .sh{font-size:10px;font-weight:600;opacity:.8;color:#64748b}"
)

c = c.replace(
    ".sb.on{background:linear-gradient(180deg,#20d5ec,#00a8c8);color:#001a20;border-color:rgba(37,244,238,.6);box-shadow:0 5px 0 #006080,0 6px 20px rgba(32,213,236,.5)}",
    ".sb.on{background:linear-gradient(180deg,#20d5ec,#00a8c8);color:#001a20;border-color:rgba(37,244,238,.8);box-shadow:0 5px 0 #006080,0 6px 20px rgba(32,213,236,.5);font-size:13px}"
)

c = c.replace(
    ".sb.on .sh{opacity:.9;color:#004d5c}",
    ".sb.on .sh{opacity:1;color:#004d5c;font-weight:700;font-size:11px}"
)

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
print("OK botones sorteo")

# 2. Mejorar panel admin con buscador y contador
c2 = open("app/admin/page.tsx", encoding="utf-8").read()

# Agregar contadores y buscador mejorado
old_search = 'value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar usuario..."'
new_search = 'value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por email..."  style={{width:"100%",background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:10,color:"#e2e8f0",padding:"10px 14px",fontSize:13,fontFamily:"inherit",outline:"none"}}'

if old_search in c2:
    c2 = c2.replace(old_search, new_search)
    print("OK search input")

# Agregar contadores antes de la tabla
old_table = 'value={search} onChange={e=>setSearch(e.target.value)}'
# Find the section before the table and add counters
idx = c2.find('<table')
if idx > 0:
    counters = """<div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{background:"rgba(255,45,85,.08)",border:"1px solid rgba(255,45,85,.2)",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#ff6b81",fontWeight:700}}>
          Total: {users.length} usuarios
        </div>
        <div style={{background:"rgba(32,213,236,.08)",border:"1px solid rgba(32,213,236,.2)",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#20d5ec",fontWeight:700}}>
          Premium: {users.filter(u=>u.role==="premium"||u.role==="admin").length}
        </div>
        <div style={{background:"rgba(201,168,76,.08)",border:"1px solid rgba(201,168,76,.2)",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#c9a84c",fontWeight:700}}>
          Admin: {users.filter(u=>u.role==="admin").length}
        </div>
        <div style={{background:"rgba(100,116,139,.08)",border:"1px solid rgba(100,116,139,.2)",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#94a3b8",fontWeight:700}}>
          Free: {users.filter(u=>u.role==="free"||!u.role).length}
        </div>
      </div>
"""
    c2 = c2[:idx] + counters + c2[idx:]
    print("OK contadores")

open("app/admin/page.tsx", "w", encoding="utf-8").write(c2)
