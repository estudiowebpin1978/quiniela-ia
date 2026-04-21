#!/usr/bin/env python3
"""
Script para obtener datos históricos de ruta1000.com.ar y guardarlos en Supabase.
Uso: python scripts/ingest_ruta1000.py --days 365
"""

import argparse
import requests
import os
import sys
from datetime import datetime, timedelta

SUPABASE_URL = "https://wazkylxgqckjfkcmfotl.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhemt5bHhncWNramZrY21mb3RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI0Nzc1NSwiZXhwIjoyMDg3ODIzNzU1fQ.IiksS0WwZZVlx9XJCzLhswJzSeeWnNS0dp3Z5uZiCSs"
TABLE_NAME = "draws"

URL_BASE = "https://www.ruta1000.com.ar/index2008.php?Resultado=Quiniela_Nacional_Sorteos_Anteriores"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml",
}

def obtener_sorteos(html):
    """Parsea los sorteos del HTML"""
    import re
    from bs4 import BeautifulSoup
    
    soup = BeautifulSoup(html, "html.parser")
    sorteos = []
    
    for tr in soup.find_all("tr"):
        cells = tr.find_all("td")
        if len(cells) < 21:
            continue
        
        text = cells[0].get_text()
        if not text or "/" not in text:
            continue
        
        # Buscar la fecha
        fecha_match = re.search(r"(\d{2})/(\d{2})/(\d{4})", text)
        if not fecha_match:
            continue
        
        fecha = f"{fecha_match.group(3)}-{fecha_match.group(2)}-{fecha_match.group(1)}"
        
        # Buscar hora
        hora_match = re.search(r"(\d{2}):(\d{2})", text)
        if not hora_match:
            continue
        
        hora = int(hora_match.group(1))
        minuto = int(hora_match.group(2))
        
        # Determinar turno
        if hora == 10 and minuto == 15:
            turno = "previa"
        elif hora == 12:
            turno = "primera"
        elif hora == 15:
            turno = "matutina"
        elif hora == 18:
            turno = "vespertina"
        elif hora == 21:
            turno = "nocturna"
        else:
            continue
        
        # Extraer números
        numeros = []
        for i in range(1, 21):
            if i < len(cells):
                num_text = cells[i].get_text(strip=True)
                if num_text.isdigit() and len(num_text) == 4:
                    numeros.append({"numero": num_text, "puesto": i})
        
        if len(numeros) == 20:
            sorteos.append({
                "fecha": fecha,
                "turno": turno,
                "numeros": numeros
            })
    
    return sorteos

def guardar_en_supabase(sorteos):
    """Guarda los sorteos en Supabase"""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    
    guardados = 0
    errores = 0
    
    for sorteo in sorteos:
        url = f"{SUPABASE_URL}/rest/v1/{TABLE_NAME}"
        data = {
            "date": sorteo["fecha"],
            "turno": sorteo["turno"],
            "numbers": [int(n["numero"]) for n in sorteo["numeros"]]
        }
        
        try:
            resp = requests.post(url, json=data, headers=headers, timeout=10)
            if resp.status_code in [200, 201]:
                guardados += 1
                print(f"  [OK] {sorteo['fecha']} {sorteo['turno']}")
            else:
                errores += 1
                print(f"  [ERR] {sorteo['fecha']} {sorteo['turno']}: {resp.status_code}")
        except Exception as e:
            errores += 1
            print(f"  [ERR] Error: {e}")
    
    return guardados, errores

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Ingesta datos de Quiniela desde ruta1000.com.ar")
    parser.add_argument("--days", type=int, default=30, help="Numero de dias hacia atras")
    args = parser.parse_args()
    
    print(f"Obteniendo datos de los ultimos {args.days} dias...")
    print(f"URL: {URL_BASE}")
    
    # Obtener pagina
    try:
        resp = requests.get(URL_BASE, headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            print(f"Error obteniendo pagina: {resp.status_code}")
            sys.exit(1)
    except Exception as e:
        print(f"Error de conexion: {e}")
        sys.exit(1)
    
    print(f"Pagina obtenida: {len(resp.text)} bytes")
    
    # Parsear sorteos
    print("Parseando sorteos...")
    sorteos = obtener_sorteos(resp.text)
    
    print(f"Sorteos encontrados: {len(sorteos)}")
    
    if not sorteos:
        print("No se encontraron sorteos")
        sys.exit(0)
    
    # Mostrar preview
    print("\nPreview de sorteos:")
    for s in sorteos[:5]:
        print(f"  {s['fecha']} {s['turno']}: {len(s['numeros'])} numeros")
    
    # Guardar
    print("\nGuardando en Supabase...")
    guardados, errores = guardar_en_supabase(sorteos)
    
    print(f"\nCompletado: {guardados} guardados, {errores} errores")

if __name__ == "__main__":
    main()