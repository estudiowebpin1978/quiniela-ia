c = open("app/api/pago-uala/route.ts", encoding="utf-8").read()

# Segun la doc oficial y el test que funcionó antes
# El endpoint de token que funciona es auth.developers.ar.ua.la/v2/api/auth/token
# El body correcto tiene client_secret_id no client_secret

old_token_body = """body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret_id: clientSecret,
        username: userName
      }),"""

# Ya esta correcto - verificar la URL
idx = c.find("auth/token")
print("Token URL:", repr(c[idx-50:idx+20]))

# Verificar si el problema es el timeout de Vercel
# Agregar mas tiempo
old_timeout = "signal: AbortSignal.timeout(10000)"
new_timeout = "signal: AbortSignal.timeout(15000)"
count = c.count(old_timeout)
print(f"Timeouts encontrados: {count}")
c = c.replace(old_timeout, new_timeout)

open("app/api/pago-uala/route.ts", "w", encoding="utf-8").write(c)
print("OK")
