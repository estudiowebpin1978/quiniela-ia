c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Cambiar botones de sorteo a cyan/turquesa TikTok
c = c.replace(
    ".sb.on{background:linear-gradient(180deg,#ff2d55,#cc0033);color:#fff;border-color:rgba(255,107,129,.6);box-shadow:0 5px 0 #800020,0 6px 20px rgba(255,45,85,.5)}",
    ".sb.on{background:linear-gradient(180deg,#20d5ec,#00a8c8);color:#001a20;border-color:rgba(37,244,238,.6);box-shadow:0 5px 0 #006080,0 6px 20px rgba(32,213,236,.5)}"
)

# Cambiar hover de sorteo
c = c.replace(
    ".sb.on .sh{opacity:.8;color:#ffb3bf}",
    ".sb.on .sh{opacity:.9;color:#004d5c}"
)

# Cambiar hover de sorteo inactivo
c = c.replace(
    ".sb:hover:not(.on){background:linear-gradient(180deg,#252535,#18182a);color:#94a3b8;border-color:rgba(255,255,255,.12)}",
    ".sb:hover:not(.on){background:linear-gradient(180deg,#0d2a2e,#081a1e);color:#20d5ec;border-color:rgba(32,213,236,.2)}"
)

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
print("OK" if "#20d5ec" in open("app/predictions/page.tsx", encoding="utf-8").read() else "ERROR")
