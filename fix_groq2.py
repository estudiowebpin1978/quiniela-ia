c = open("app/api/predictions/route.ts", encoding="utf-8").read()

# Mover el bloque groq despues de la declaracion de top10
# Primero eliminar el bloque groq mal ubicado
import re
groq_block = re.search(r'    // GROQ AI INSIGHT.*?return NextResponse\.json\(\{', c, re.DOTALL)
if groq_block:
    # Extraer solo el codigo groq sin el return
    groq_code = groq_block.group(0)
    groq_only = groq_code.replace("    return NextResponse.json({", "").strip()
    # Quitar bloque actual
    c = c.replace(groq_code, "    return NextResponse.json({", 1)
    # Insertar despues de rdblPar declaration
    c = c.replace(
        "    const pred3d",
        groq_only + "\n    const pred3d"
    )
    print("OK - Groq reubicado")
else:
    print("ERROR - bloque groq no encontrado")

open("app/api/predictions/route.ts", "w", encoding="utf-8").write(c)
