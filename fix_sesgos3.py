c = open("app/api/predictions/route.ts", encoding="utf-8").read()

# Verificar como estan definidos SB y SK
idx = c.find("const SB")
print("SB def:", repr(c[idx:idx+80]))

# Reemplazar llamada con valores directos
c = c.replace(
    "const sesgosActivos = await getSesgos(SB(), SK())",
    "const sesgosActivos = await getSesgos((process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\"/g,'').trim(),(process.env.SUPABASE_SERVICE_ROLE_KEY||'').replace(/\"/g,'').trim())"
)

open("app/api/predictions/route.ts", "w", encoding="utf-8").write(c)
print("OK")
