c = open("app/api/cron/route.ts", encoding="utf-8").read()

# Verificar fuente actual
idx = c.find("quinielanacional1")
print("Fuente actual:", repr(c[idx:idx+50]) if idx>0 else "no encontrada")
idx2 = c.find("quinieleando")
print("quinieleando:", "ya existe" if idx2>0 else "no existe")
