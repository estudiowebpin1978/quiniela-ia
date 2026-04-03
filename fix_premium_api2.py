c = open("app/api/predictions/route.ts", encoding="utf-8").read()

# Eliminar import de isPremiumUser
c = c.replace('import { isPremiumUser } from "../../../lib/auth-premium"\n', "")
c = c.replace("import { isPremiumUser } from '../../../lib/auth-premium'\n", "")

# Buscar donde se llama isPremiumUser
import re
idx = c.find("isPremiumUser")
if idx > 0:
    print("isPremiumUser en:", repr(c[idx-100:idx+150]))

# Eliminar chequeo premium - siempre devolver datos completos
# El gating lo hace el frontend
old = """    if (!premium) {
      return NextResponse.json({
        ...base,
        upgradeHint: "Premium: redoblona avanzada, 3 y 4 cifras, mapa de calor completo.",
      })
    }"""

if old in c:
    c = c.replace(old, "", 1)
    print("OK - chequeo premium eliminado")
else:
    # Buscar variante
    idx2 = c.find("upgradeHint")
    print("upgradeHint context:", repr(c[idx2-200:idx2+50]))

# Eliminar tier del response
c = c.replace('"tier":"free",', "")
c = c.replace('tier: "free",', "")
c = c.replace('tier: "premium",', "")
c = c.replace('tier: premium ? "premium" : "free",', "")

open("app/api/predictions/route.ts", "w", encoding="utf-8").write(c)
print("done")
