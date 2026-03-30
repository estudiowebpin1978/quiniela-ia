c = open("app/api/predictions/route.ts", encoding="utf-8").read()

import re

# Eliminar bloque groq mal ubicado
groq_block = re.search(r'\s*// GROQ AI INSIGHT.*?(?=\n    const pred3d|\n    const heatmap|\n    return)', c, re.DOTALL)
if groq_block:
    c = c.replace(groq_block.group(0), "", 1)
    print("Bloque groq eliminado")

# Insertar groq justo antes del return final
groq_code = """
    // GROQ AI INSIGHT
    let aiInsight = ""
    try {
      const groqKey = process.env.GROQ_API_KEY
      if (groqKey && top10.length > 0) {
        const top5str = top10.slice(0,5).map((x:any)=>x.numero+"("+x.significado+",f:"+x.frecuencia+")").join(", ")
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {"Authorization":"Bearer "+groqKey,"Content-Type":"application/json"},
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            max_tokens: 100,
            messages: [{role:"user",content:"Sos analista de quiniela argentina. Sorteo "+sorteo+", "+rows.length+" sorteos analizados. Top 5: "+top5str+". Da un consejo corto en 2 oraciones en espanol informal. Sin asteriscos."}]
          }),
          signal: AbortSignal.timeout(5000)
        })
        if (groqRes.ok) {
          const gd = await groqRes.json()
          aiInsight = gd.choices?.[0]?.message?.content?.trim() || ""
        }
      }
    } catch {}
"""

# Insertar antes del return final
c = c.replace("    return NextResponse.json({\n      numeros:", groq_code + "    return NextResponse.json({\n      numeros:", 1)

# Agregar aiInsight al response
c = c.replace(
    "      precision:",
    "      aiInsight,\n      precision:"
)

open("app/api/predictions/route.ts", "w", encoding="utf-8").write(c)
print("OK" if "aiInsight" in c else "ERROR")
