c = open("app/api/pago-uala/route.ts", encoding="utf-8").read()

# Corregir URL del token
old = '"https://auth.developers.ar.ua.la/oauth/token"'
new = '"https://auth.developers.ar.ua.la/v2/api/auth/token"'

if old in c:
    c = c.replace(old, new, 1)
    print("OK - URL token corregida")
else:
    idx = c.find("auth/token")
    print("URL actual:", repr(c[idx-50:idx+30]))

open("app/api/pago-uala/route.ts", "w", encoding="utf-8").write(c)
