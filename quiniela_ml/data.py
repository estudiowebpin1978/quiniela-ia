"""
Acceso a datos: carga histórica desde Supabase o desde CSV.
"""
import os
import csv
import json
import requests
from datetime import datetime, timedelta
from typing import Optional

SUPABASE_URL = os.environ.get(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://wazkylxgqckjfkcmfotl.supabase.co"
)
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def obtener_sorteos_supabase(
    dias: int = 365,
    turno: Optional[str] = None,
    limit: int = 10000
) -> list[dict]:
    """
    Obtiene sorteos desde Supabase.
    
    Returns:
        lista de dicts con {date, turno, numbers}
    """
    if not SUPABASE_KEY:
        raise ValueError("SUPABASE_SERVICE_ROLE_KEY no configurada")
    
    url = f"{SUPABASE_URL}/rest/v1/draws"
    params = {
        "select": "date,turno,numbers",
        "order": "date.asc",
        "limit": limit
    }
    if turno:
        params["turno"] = f"ilike.*{turno}*"
    
    resp = requests.get(url, params=params, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}"
    })
    resp.raise_for_status()
    return resp.json()


def cargar_desde_supabase(
    dias: int = 365,
    turno: Optional[str] = None
) -> tuple[list[list[int]], list[str]]:
    """
    Carga datos desde Supabase y los procesa.
    
    Returns:
        (historico_completo, turnos)
        - historico_completo: lista de listas de números (4 cifras)
        - turnos: lista de strings con el turno de cada sorteo
    """
    datos = obtener_sorteos_supabase(dias=dias, turno=turno)
    
    historico = []
    turnos = []
    
    for row in datos:
        if not isinstance(row.get("numbers"), list) or len(row["numbers"]) < 20:
            continue
        nums = [
            int(n) for n in row["numbers"]
            if isinstance(n, (int, float)) and 0 <= n <= 9999
        ]
        if len(nums) >= 20:
            historico.append(nums[:20])
            turnos.append(row.get("turno", "Nocturna"))
    
    print(f"Cargados {len(historico)} sorteos desde Supabase")
    return historico, turnos


def cargar_desde_csv(path: str) -> tuple[list[list[int]], list[str]]:
    """
    Carga datos desde archivo CSV.
    
    Formato esperado: fecha,turno,numero1,numero2,...,numero20
    """
    historico = []
    turnos = []
    
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            nums = []
            for i in range(1, 21):
                key = f"numero{i}"
                if key in row and row[key].strip():
                    try:
                        nums.append(int(row[key].strip()))
                    except ValueError:
                        pass
            if len(nums) >= 20:
                historico.append(nums[:20])
                turnos.append(row.get("turno", "Nocturna"))
    
    print(f"Cargados {len(historico)} sorteos desde {path}")
    return historico, turnos


def generar_datos_prueba(n_sorteos: int = 200) -> tuple[list[list[int]], list[str]]:
    """
    Genera datos de prueba sintéticos para testing.
    """
    import random
    random.seed(42)
    
    historico = []
    turnos = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
    turnos_lista = []
    
    for i in range(n_sorteos):
        # Generar 20 números de 4 cifras
        nums = [random.randint(0, 9999) for _ in range(20)]
        historico.append(nums)
        turnos_lista.append(turnos[i % len(turnos)])
    
    print(f"Generados {n_sorteos} sorteos de prueba")
    return historico, turnos_lista
