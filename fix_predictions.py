import urllib.request, os
url = "https://raw.githubusercontent.com/estudiowebpin1978/quiniela-ia/main/app/api/predictions/route.ts"
# Si no funciona la descarga, creamos el archivo manualmente
print("Verificando archivo actual...")
c = open("app/api/predictions/route.ts", encoding="utf-8").read()
print("Factores actuales:", "DiaSemana" in c, "Correlacion" in c, "precision" in c)
