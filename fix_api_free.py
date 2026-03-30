c = open("app/api/predictions/route.ts", encoding="utf-8").read()

# Eliminar el chequeo de tier - siempre devolver datos completos
# El gating lo hace el frontend
import re

# Reemplazar tier:premium/free por siempre devolver todo
c = c.replace(
    'tier: premium ? "premium" : "free",',
    'tier: "premium",'
)

# Eliminar logica de premium en la API si existe
if "const authHeader" in c:
    # Eliminar bloque de verificacion de token
    c = re.sub(r'const authHeader.*?const premium.*?\n', '', c, flags=re.DOTALL)

open("app/api/predictions/route.ts", "w", encoding="utf-8").write(c)
print("tier en respuesta:", c.count('tier:'))
print("premium check:", "isPremium" in c or "premium" in c[:500])
