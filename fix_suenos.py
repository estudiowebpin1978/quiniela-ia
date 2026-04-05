c = open("app/api/predictions/route.ts", encoding="utf-8").read()

# Contar cuantas veces aparece SUENOS
count = c.count("const SUENOS")
print(f"SUENOS aparece {count} veces")

if count > 1:
    # Eliminar la primera ocurrencia duplicada
    first = c.find("const SUENOS")
    second = c.find("const SUENOS", first+1)
    
    # Encontrar el fin del primer bloque
    depth = 0
    i = first
    while i < len(c):
        if c[i] == "{": depth += 1
        elif c[i] == "}":
            depth -= 1
            if depth == 0:
                end_first = i + 1
                break
        i += 1
    
    # Eliminar primer bloque
    c = c[:first] + c[end_first:]
    print("OK - duplicado eliminado")

open("app/api/predictions/route.ts", "w", encoding="utf-8").write(c)
print("SUENOS restantes:", c.count("const SUENOS"))
