c = open("app/api/pago-uala/route.ts", encoding="utf-8").read()

old = "    const orderData = await orderRes.json()\n    if (!orderRes.ok) return NextResponse.json({ error: \"Error orden\", detail: orderData }, { status: 500 })"

new = "    const orderData = await orderRes.json()\n    if (!orderRes.ok) return NextResponse.json({ error: \"Error orden\", status: orderRes.status, detail: orderData }, { status: 500 })"

c = c.replace(old, new)

# Tambien loggear el token response
old2 = "    const tokenData = await tokenRes.json()\n    const token = tokenData.access_token\n    if (!token) return NextResponse.json({ error: \"Sin token\", detail: tokenData }, { status: 500 })"
new2 = "    const tokenData = await tokenRes.json()\n    const token = tokenData.access_token\n    if (!token) return NextResponse.json({ error: \"Sin token\", detail: tokenData, keys: Object.keys(tokenData) }, { status: 500 })"

c = c.replace(old2, new2)
open("app/api/pago-uala/route.ts", "w", encoding="utf-8").write(c)
print("OK")
