c = open("app/api/cron/route.ts", encoding="utf-8").read()

# Los numeros deben guardarse como integers, el padding es para mostrar
# El problema es que 0216 se guarda como 216
# Verificar como se extraen
idx = c.find("parseInt")
print("parseInt context:", repr(c[idx-20:idx+50]))
print()
idx2 = c.find("nums.push")
print("push context:", repr(c[idx2-10:idx2+60]))
