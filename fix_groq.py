c = open("app/api/predictions/route.ts", encoding="utf-8").read()

# Agregar llamada a Groq al final antes del return
old = "    return NextResponse.json({"
new = """    // GROQ AI INSIGHT
    let aiInsight = ""
    try {
      const groqKey = process.env.GROQ_API_KEY
      if (groqKey) {
        const top5str = top10.slice(0,5).map((x:any)=>`${x.numero}(${x.significado},f:${x.frecuencia},atraso:${x.atraso})`).join(", ")
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {"Authorization":"Bearer "+groqKey,"Content-Type":"application/json"},
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            max_tokens: 120,
            messages: [{
              role: "user",
              content: `Sos un analista de quiniela argentina. Analizaste ${rows.length} sorteos del turno ${sorteo}. Los 5 numeros con mayor probabilidad estadistica son: ${top5str}. El par de redoblona optimo es ${rdblPar}. Da un consejo corto y practico de maximo 2 oraciones en espanol argentino informal. Sin asteriscos ni formato.`
            }]
          }),
          signal: AbortSignal.timeout(5000)
        })
        if (groqRes.ok) {
          const gd = await groqRes.json()
          aiInsight = gd.choices?.[0]?.message?.content?.trim() || ""
        }
      }
    } catch {}

    return NextResponse.json({"""

if "GROQ AI INSIGHT" not in c:
    c = c.replace("    return NextResponse.json({", new, 1)
    print("OK - Groq agregado")
else:
    print("Groq ya existe")

open("app/api/predictions/route.ts", "w", encoding="utf-8").write(c)
