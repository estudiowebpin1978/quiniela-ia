c = open("app/api/pago-uala/route.ts", encoding="utf-8").read()

# URL correcta segun documentacion oficial
old = '"https://checkout.developers.ar.ua.la/v2/api/checkout/orders"'
new = '"https://checkout.developers.ar.ua.la/v2/api/checkout"'

if old in c:
    c = c.replace(old, new, 1)
    print("OK - URL corregida")
else:
    idx = c.find("checkout.developers")
    print("URL actual:", repr(c[idx:idx+70]))

# amount debe ser string segun docs
old2 = "amount: 10000,"
new2 = 'amount: "10000",'
if old2 in c:
    c = c.replace(old2, new2, 1)
    print("OK - amount como string")

# Eliminar X-Username que no esta en la doc
old3 = '        "X-Username": userName\n      },'
if old3 in c:
    c = c.replace(old3, '      },', 1)
    print("OK - X-Username eliminado")

# Agregar external_reference con email
old4 = '        notification_url: "https://quiniela-ia-two.vercel.app/api/webhooks/uala"'
new4 = '        notification_url: "https://quiniela-ia-two.vercel.app/api/webhooks/uala",\n        external_reference: email'
if old4 in c:
    c = c.replace(old4, new4, 1)
    print("OK - external_reference agregado")

open("app/api/pago-uala/route.ts", "w", encoding="utf-8").write(c)
