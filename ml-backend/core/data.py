"""Acceso a datos: carga histórica desde Supabase."""
import os
import requests
from typing import Optional

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def obtener_sorteos_supabase(dias=365, turno=None, limit=10000):
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


def cargar_desde_supabase(dias=365, turno=None):
    datos = obtener_sorteos_supabase(dias=dias, turno=turno)
    historico = []
    turnos = []
    for row in datos:
        if not isinstance(row.get("numbers"), list) or len(row["numbers"]) < 20:
            continue
        nums = [int(n) for n in row["numbers"] if isinstance(n, (int, float)) and 0 <= n <= 9999]
        if len(nums) >= 20:
            historico.append(nums[:20])
            turnos.append(row.get("turno", "Nocturna"))
    return historico, turnos
