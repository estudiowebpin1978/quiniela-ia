c = open("app/api/pago-uala/route.ts", encoding="utf-8").read()

# Probar con la URL del SDK oficial
old = '"https://checkout.developers.ar.ua.la/v2/api/checkout/orders"'
new = '"https://checkout.developers.ar.ua.la/v2/api/merchants/orders"'

# Mostrar URL actual
idx = c.find("checkout.developers")
if idx > 0:
    print("URL actual:", repr(c[idx:idx+80]))

# Tambien mostrar el body que se envia
idx2 = c.find("body: JSON.stringify({")
print("Body actual:", repr(c[idx2:idx2+200]))
