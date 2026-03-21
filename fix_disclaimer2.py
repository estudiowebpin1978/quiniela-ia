c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Eliminar el segundo disclaimer duplicado
old = "Herramienta de analisis estadistico con fines informativos. No realiza apuestas ni maneja dinero. La Quiniela de la Ciudad es administrada por la Loteria de la Ciudad de Buenos Aires. El juego en exceso puede causar adiccion. Linea de ayuda gratuita: 0800-333-0062. Mayores de 18 anos."
c = c.replace(old, "", 1)

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
count = c.count("0800-333-0062")
print(f"OK - quedan {count} disclaimer(s)")
