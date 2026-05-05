"""
=============================================================
  SCRAPER - QUINIELA NACIONAL (Ciudad de Buenos Aires)
  Fuente: quinieleando.com.ar
  Raspa los últimos 365 días de sorteos (Lun-Sáb)
  Exporta: quiniela_nacional_historico.csv
=============================================================

Requisitos:
    pip install requests beautifulsoup4

Uso:
    python scraper_quiniela_nacional.py

El archivo CSV resultante tendrá estas columnas:
    fecha, dia_semana, turno, posicion_1..posicion_20
"""

import requests
from bs4 import BeautifulSoup
import csv
import time
from datetime import date, timedelta

# ──────────────────────────────────────────────
# CONFIGURACIÓN
# ──────────────────────────────────────────────
BASE_URL    = "https://quinieleando.com.ar/quinielas/nacional/resultados-del-{dia}-{mes}-{anio}"
DIAS_ATRAS  = 365          # cuántos días hacia atrás raspar
DELAY_SEG   = 0.8          # pausa entre requests (respetar el servidor)
ARCHIVO_CSV = "quiniela_nacional_historico.csv"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}

TURNOS_ESPERADOS = ["LA PREVIA", "LA PRIMERA", "MATUTINA", "VESPERTINA", "NOCTURNA"]

DIAS_ES = {
    0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves",
    4: "Viernes", 5: "Sábado", 6: "Domingo"
}

# ──────────────────────────────────────────────
# FUNCIONES
# ──────────────────────────────────────────────

def generar_fechas(dias_atras: int) -> list[date]:
    """Genera todas las fechas de lunes a sábado de los últimos N días."""
    hoy = date.today()
    fechas = []
    for i in range(dias_atras + 1):
        d = hoy - timedelta(days=i)
        if d.weekday() != 6:  # excluir domingos (no hay sorteo)
            fechas.append(d)
    return sorted(fechas)  # orden cronológico


def construir_url(fecha: date) -> str:
    return BASE_URL.format(
        dia=str(fecha.day).zfill(2),
        mes=str(fecha.month).zfill(2),
        anio=fecha.year
    )


def parsear_pagina(html: str, fecha: date) -> list[dict]:
    """
    Extrae todos los sorteos de una página diaria.
    Devuelve lista de dicts con fecha, turno y los 20 números.
    """
    soup = BeautifulSoup(html, "html.parser")
    registros = []

    tablas = soup.find_all("table")

    for tabla in tablas:
        # La cabecera de cada tabla tiene el nombre del turno
        thead_text = tabla.find("th")
        if not thead_text:
            continue

        header = thead_text.get_text(separator=" ", strip=True).upper()

        turno = None
        for t in TURNOS_ESPERADOS:
            if t in header:
                turno = t
                break

        if not turno:
            continue

        # Extraer los 20 números de las celdas
        celdas = tabla.find_all("td")
        numeros = {}
        pos = 1
        idx = 0

        while idx < len(celdas) and pos <= 20:
            texto = celdas[idx].get_text(strip=True)
            # Cada posición sigue el patrón: numero_posicion, numero_resultado (4 dígitos)
            if texto.isdigit() and len(texto) <= 2:
                # es el número de posición
                try:
                    pos_num = int(texto)
                    if 1 <= pos_num <= 20 and idx + 1 < len(celdas):
                        resultado = celdas[idx + 1].get_text(strip=True)
                        if len(resultado) == 4 and resultado.isdigit():
                            numeros[pos_num] = resultado
                            pos = pos_num + 1
                            idx += 2
                            continue
                except ValueError:
                    pass
            idx += 1

        if len(numeros) >= 15:  # al menos 15 de 20 posiciones encontradas
            registro = {
                "fecha": fecha.strftime("%Y-%m-%d"),
                "dia_semana": DIAS_ES[fecha.weekday()],
                "turno": turno,
            }
            for p in range(1, 21):
                registro[f"pos_{p:02d}"] = numeros.get(p, "")
            registros.append(registro)

    return registros


def raspar_fecha(fecha: date, session: requests.Session) -> list[dict]:
    url = construir_url(fecha)
    try:
        resp = session.get(url, headers=HEADERS, timeout=15)
        if resp.status_code == 200:
            return parsear_pagina(resp.text, fecha)
        elif resp.status_code == 404:
            print(f"  [404] {fecha} - no existe (feriado/suspensión)")
        else:
            print(f"  [HTTP {resp.status_code}] {fecha}")
    except requests.RequestException as e:
        print(f"  [ERROR] {fecha}: {e}")
    return []


def guardar_csv(todos_registros: list[dict], archivo: str):
    if not todos_registros:
        print("⚠  No hay datos para guardar.")
        return

    columnas = (
        ["fecha", "dia_semana", "turno"] +
        [f"pos_{p:02d}" for p in range(1, 21)]
    )

    with open(archivo, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columnas)
        writer.writeheader()
        writer.writerows(todos_registros)

    print(f"\n✅  CSV guardado: {archivo}  ({len(todos_registros)} registros)")


# ──────────────────────────────────────────────
# EJECUCIÓN PRINCIPAL
# ──────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  SCRAPER QUINIELA NACIONAL - CIUDAD DE BUENOS AIRES")
    print("=" * 60)

    fechas = generar_fechas(DIAS_ATRAS)
    total  = len(fechas)
    print(f"\n📅  Fechas a procesar: {total}  ({fechas[0]} → {fechas[-1]})\n")

    todos_registros = []
    session = requests.Session()

    for i, fecha in enumerate(fechas, 1):
        print(f"[{i:>3}/{total}]  {fecha}  ({DIAS_ES[fecha.weekday()]})", end="  ")
        registros = raspar_fecha(fecha, session)
        if registros:
            print(f"→  {len(registros)} sorteos encontrados")
            todos_registros.extend(registros)
        else:
            print("→  sin datos")

        if i < total:
            time.sleep(DELAY_SEG)

    print(f"\n📊  Total de registros recopilados: {len(todos_registros)}")
    guardar_csv(todos_registros, ARCHIVO_CSV)

    # ── Estadísticas rápidas ──────────────────
    if todos_registros:
        from collections import Counter
        print("\n── ESTADÍSTICAS RÁPIDAS ─────────────────────────")

        # Cabezas más frecuentes (posición 1)
        cabezas = [r["pos_01"][:2] for r in todos_registros if r["pos_01"]]
        top_cab = Counter(cabezas).most_common(10)
        print("\nTop 10 terminaciones más frecuentes en CABEZA (pos 1):")
        for num, cnt in top_cab:
            print(f"  {num}: {cnt} veces")

        # Turnos disponibles
        turnos = Counter(r["turno"] for r in todos_registros)
        print(f"\nRegistros por turno:")
        for t, c in sorted(turnos.items()):
            print(f"  {t:<15}: {c}")

        print("\n✔  ¡Listo! Revisá el archivo:", ARCHIVO_CSV)


if __name__ == "__main__":
    main()
