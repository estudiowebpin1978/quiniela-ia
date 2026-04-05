c = open("app/api/pago-uala/route.ts", encoding="utf-8").read()

old = """      body: JSON.stringify({
        amount: "10000",
        description: `Premium Quiniela IA - ${email}`,
        callback_success: "https://quiniela-ia-two.vercel.app/predictions?pago=ok",
        callback_fail: "https://quiniela-ia-two.vercel.app/predictions?pago=error",
        notification_url: "https://quiniela-ia-two.vercel.app/api/webhooks/uala",
        external_reference: email
      })"""

new = """      body: JSON.stringify({
        amount: "10000",
        description: `Premium Quiniela IA - ${email}`,
        callback_success: "https://quiniela-ia-two.vercel.app/predictions?pago=ok",
        callback_fail: "https://quiniela-ia-two.vercel.app/predictions?pago=error",
        notification_url: "https://quiniela-ia-two.vercel.app/api/webhooks/uala",
        external_reference: email
      }),
      signal: AbortSignal.timeout(15000)"""

if old in c:
    c = c.replace(old, new, 1)
    print("OK timeout agregado")

# Mostrar el body completo de la orden para verificar
idx = c.find("checkout.developers.ar.ua.la/v2/api/checkout")
print("URL orden:", repr(c[idx:idx+50]))

open("app/api/pago-uala/route.ts", "w", encoding="utf-8").write(c)
