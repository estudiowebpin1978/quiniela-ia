c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Extraer las funciones que estan despues del return
import re

# Buscar proximoSorteo function
ps_match = re.search(r'(\n  function proximoSorteo[^}]+\}[^}]+\}[^}]+\})', c)
copiar_match = re.search(r'(\n  function copiar\(\)[^}]+\}[^}]+\}[^}]+\}[^}]+\})', c)

if ps_match and copiar_match:
    ps_fn = ps_match.group(1)
    copiar_fn = copiar_match.group(1)
    
    # Remove them from current position
    c = c.replace(ps_fn, "", 1)
    c = c.replace(copiar_fn, "", 1)
    
    # Insert before return
    c = c.replace("  const nums:any[]=", ps_fn + "\n" + copiar_fn + "\n  const nums:any[]=", 1)
    print("OK - funciones movidas antes del return")
else:
    print("Buscando funciones...")
    if "proximoSorteo" in c:
        idx = c.find("function proximoSorteo")
        print("proximoSorteo en linea:", c[:idx].count("\n")+1)
    if "function copiar" in c:
        idx = c.find("function copiar")
        print("copiar en linea:", c[:idx].count("\n")+1)
    idx_ret = c.find("  return(<>")
    print("return en linea:", c[:idx_ret].count("\n")+1)

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
