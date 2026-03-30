c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Agregar token en la llamada a predictions
old = 'const r=await fetch("/api/predictions?sorteo="+encodeURIComponent(so))'
new = 'const r=await fetch("/api/predictions?sorteo="+encodeURIComponent(so),{headers:{Authorization:"Bearer "+tkRef.current}})'

if old in c:
    c = c.replace(old, new, 1)
    print("OK - token enviado en predictions")
else:
    print("Buscando...")
    idx = c.find("/api/predictions")
    print(repr(c[idx-10:idx+80]))

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
