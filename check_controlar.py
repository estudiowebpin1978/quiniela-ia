c = open("app/predictions/page.tsx", encoding="utf-8").read()
idx = c.find("controlarJugada")
print(repr(c[idx:idx+800]))
