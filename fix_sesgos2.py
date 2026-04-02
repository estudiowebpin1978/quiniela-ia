c = open("app/api/predictions/route.ts", encoding="utf-8").read()

# Fix - usar SB() y SK() correctamente en getSesgos
old = """async function getSesgos(): Promise<Record<string,number[]>> {
  try {
    const r = await fetch(`${SB()}/rest/v1/config?key=eq.sesgos&select=value&limit=1`,{
      headers:{"apikey":SK(),"Authorization":`Bearer ${SK()}`},
      signal:AbortSignal.timeout(3000)
    })"""

new = """async function getSesgos(sb:string, sk:string): Promise<Record<string,number[]>> {
  try {
    const r = await fetch(`${sb}/rest/v1/config?key=eq.sesgos&select=value&limit=1`,{
      headers:{"apikey":sk,"Authorization":`Bearer ${sk}`},
      signal:AbortSignal.timeout(3000)
    })"""

if old in c:
    c = c.replace(old, new, 1)
    print("OK - getSesgos fixed")
else:
    print("buscando...")
    idx = c.find("getSesgos")
    print(repr(c[idx:idx+200]))

# Fix llamada con parametros
c = c.replace(
    "const sesgosActivos = await getSesgos()",
    "const sesgosActivos = await getSesgos(SB(), SK())"
)

open("app/api/predictions/route.ts", "w", encoding="utf-8").write(c)
