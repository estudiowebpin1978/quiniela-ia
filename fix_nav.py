c = open("app/predictions/page.tsx", encoding="utf-8").read()

# El problema es un </div> extra antes del nav en linea 275
# Buscar el patron del error
bad = """              </div>
      <div className="nr">"""

good = """      <div className="nr">"""

if bad in c:
    c = c.replace(bad, good, 1)
    print("Fixed extra div OK")
else:
    # Buscar contexto
    idx = c.find('<div className="nr">')
    print("Context around nr div:")
    print(repr(c[idx-100:idx+50]))

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
