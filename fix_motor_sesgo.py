c = open("app/api/predictions/route.ts", encoding="utf-8").read()

sesgo_data = """
const SESGOS: Record<string, number[]> = {
  "Previa":     [95,45,15,99],
  "Primera":    [38,73,97,37,50,72,19],
  "Matutina":   [14,24,26,74,92,20],
  "Vespertina": [27,14,43,92,68,69],
  "Nocturna":   [26,35,76,45,88]
}
"""

c = c.replace("function monteCarlo(", sesgo_data + "function monteCarlo(", 1)

old_score = """      const score = (
        0.22 * (freq[i] / mxF) +
        0.18 * (delay[i] / mxD) +
        0.18 * (cyc[i] / mxC) +
        0.14 * (mc[i] / mxM) +
        0.12 * (dw[i] / mxDW) +
        0.10 * ((trend[i] + maxT) / (2 * maxT)) +
        0.06 * (ff[i] / mxFF)
      ) * penalti"""

new_score = """      const sesgBonus = (SESGOS[sorteo]||[]).includes(i) ? 1.15 : 1.0
      const score = (
        0.22 * (freq[i] / mxF) +
        0.18 * (delay[i] / mxD) +
        0.18 * (cyc[i] / mxC) +
        0.14 * (mc[i] / mxM) +
        0.12 * (dw[i] / mxDW) +
        0.10 * ((trend[i] + maxT) / (2 * maxT)) +
        0.06 * (ff[i] / mxFF)
      ) * penalti * sesgBonus"""

if old_score in c:
    c = c.replace(old_score, new_score, 1)
    print("OK - sesgo estadistico agregado")
else:
    print("ERROR - buscando score...")
    idx = c.find("const score")
    print(repr(c[idx:idx+200]))

open("app/api/predictions/route.ts", "w", encoding="utf-8").write(c)
