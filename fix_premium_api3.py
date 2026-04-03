c = open("app/api/predictions/route.ts", encoding="utf-8").read()

# Reemplazar la llamada a isPremiumUser con true siempre
c = c.replace(
    "const premium = await isPremiumUser(req)",
    "const premium = true"
)

open("app/api/predictions/route.ts", "w", encoding="utf-8").write(c)
print("OK" if "const premium = true" in open("app/api/predictions/route.ts", encoding="utf-8").read() else "ERROR")
