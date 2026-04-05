c = open("app/api/pago-uala/route.ts", encoding="utf-8").read()

old = '"https://checkout.developers.ar.ua.la/v2/api/orders"'
new = '"https://checkout.developers.ar.ua.la/v2/api/checkout/orders"'

if old in c:
    c = c.replace(old, new)
    print("OK - URL orden actualizada")
else:
    idx = c.find("checkout.developers")
    print("URL actual:", repr(c[idx:idx+60]))

open("app/api/pago-uala/route.ts", "w", encoding="utf-8").write(c)
