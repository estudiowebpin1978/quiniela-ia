c = open("app/api/predictions/route.ts", encoding="utf-8").read()

# Buscar como se define premium
idx = c.find("premium")
print("premium context:", repr(c[idx-50:idx+150]))
