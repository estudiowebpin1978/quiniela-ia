c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Eliminar seccion tips completa
import re
tips_start = c.find('<div className="tips">')
if tips_start > 0:
    # Encontrar el cierre del div tips
    depth = 0
    i = tips_start
    while i < len(c):
        if c[i:i+4] == "<div":
            depth += 1
        elif c[i:i+6] == "</div>":
            depth -= 1
            if depth == 0:
                tips_end = i + 6
                break
        i += 1
    tips_block = c[tips_start:tips_end]
    c = c.replace(tips_block, "", 1)
    print("OK - tips eliminados")
else:
    print("ERROR - tips no encontrado")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
