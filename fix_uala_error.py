c = open("app/api/pago-uala/route.ts", encoding="utf-8").read()

old = """    const orderData = await orderRes.json()
    if (!orderRes.ok) return NextResponse.json({
      error: "Error orden",
      status: orderRes.status,
      detail: orderData
    }, { status: 500 })"""

new = """    let orderData:any = {}
    try{ orderData = await orderRes.json() }catch{}
    if (!orderRes.ok) return NextResponse.json({
      error: "Error orden",
      httpStatus: orderRes.status,
      detail: orderData,
      tokenUsed: token.slice(0,20)+"..."
    }, { status: 500 })"""

if old in c:
    c = c.replace(old, new, 1)
    print("OK - error detallado")
else:
    print("ERROR no encontrado")

open("app/api/pago-uala/route.ts", "w", encoding="utf-8").write(c)
