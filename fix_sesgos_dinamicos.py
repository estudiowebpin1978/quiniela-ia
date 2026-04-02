c = open("app/api/predictions/route.ts", encoding="utf-8").read()

# Reemplazar sesgos hardcodeados por lectura dinamica de Supabase
old_sesgos = """
const SESGOS: Record<string, number[]> = {
  "Previa":     [95,45,15,99],
  "Primera":    [38,73,97,37,50,72,19],
  "Matutina":   [14,24,26,74,92,20],
  "Vespertina": [27,14,43,92,68,69],
  "Nocturna":   [26,35,76,45,88]
}
"""

new_sesgos = """
// Sesgos por defecto - se actualizan automaticamente cada mes
const SESGOS_DEFAULT: Record<string, number[]> = {
  "Previa":     [95,45,15,99],
  "Primera":    [38,73,97,37,50,72,19],
  "Matutina":   [14,24,26,74,92,20],
  "Vespertina": [27,14,43,92,68,69],
  "Nocturna":   [26,35,76,45,88]
}
async function getSesgos(): Promise<Record<string,number[]>> {
  try {
    const r = await fetch(`${SB()}/rest/v1/config?key=eq.sesgos&select=value&limit=1`,{
      headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`},
      signal:AbortSignal.timeout(3000)
    })
    if(!r.ok) return SESGOS_DEFAULT
    const data = await r.json()
    if(!data?.[0]?.value) return SESGOS_DEFAULT
    return JSON.parse(data[0].value)
  } catch { return SESGOS_DEFAULT }
}
"""

if old_sesgos in c:
    c = c.replace(old_sesgos, new_sesgos, 1)
    print("OK - sesgos dinamicos")
else:
    print("ERROR - no encontrado")

# Actualizar uso de SESGOS por getSesgos()
c = c.replace(
    "const sesgBonus = (SESGOS[sorteo]||[]).includes(i) ? 1.15 : 1.0",
    "const sesgBonus = (sesgosActivos[sorteo]||[]).includes(i) ? 1.15 : 1.0"
)

# Agregar llamada a getSesgos antes del calculo de scores
c = c.replace(
    "    const scores = Array.from",
    "    const sesgosActivos = await getSesgos()\n    const scores = Array.from"
)

open("app/api/predictions/route.ts", "w", encoding="utf-8").write(c)
print("OK" if "getSesgos" in open("app/api/predictions/route.ts", encoding="utf-8").read() else "ERROR")
