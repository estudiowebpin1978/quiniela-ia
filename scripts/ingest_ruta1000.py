#!/usr/bin/env python3
"""
ingest_ruta1000.py
Scraper de resultados de Quiniela de la Ciudad (ex Nacional)
desde quinielanacional.ruta1000.com.ar

Uso:
    python ingest_ruta1000.py                  # hoy
    python ingest_ruta1000.py --date 2025-01-15
    python ingest_ruta1000.py --days 30        # últimos 30 días
    python ingest_ruta1000.py --all            # modo CI/CD

Requiere:
    pip install requests beautifulsoup4 supabase python-dotenv
"""

import os
import sys
import json
import time
import logging
import argparse
from datetime import date, timedelta, datetime
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# ─── Supabase (opcional, fallback a JSONL si no hay credenciales)
try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False

# ─── Config ────────────────────────────────────────────────────────────────────
load_dotenv(".env.local")
load_dotenv(".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger(__name__)

BASE_URL     = "https://quinielanacional.ruta1000.com.ar"
SORTEOS      = ["previa", "primera", "matutina", "vespertina", "nocturna"]
SORTEO_MAP   = {
    "previa":      "Previa",
    "primera":     "Primera",
    "matutina":    "Matutina",
    "vespertina":  "Vespertina",
    "nocturna":    "Nocturna",
}
MAX_RETRIES  = 3
RETRY_DELAY  = 5   # segundos entre reintentos
REQUEST_DELAY = 1.2  # cortesía al servidor

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; QuinielaIA/1.0; "
        "+https://github.com/tu-usuario/quiniela-ia)"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "es-AR,es;q=0.9",
}

DATA_DIR  = Path("data")
JSONL_FILE = DATA_DIR / "pending_draws.jsonl"

# ─── Supabase client ────────────────────────────────────────────────────────────
def get_supabase() -> Optional[object]:
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        log.warning("Supabase credentials not found — using JSONL fallback")
        return None
    if not SUPABASE_AVAILABLE:
        log.warning("supabase-py not installed — using JSONL fallback")
        return None
    return create_client(url, key)


# ─── Scraping ───────────────────────────────────────────────────────────────────
def build_url(draw_date: date, sorteo: str) -> str:
    """
    Construye la URL para un sorteo específico.
    Formato típico: /quiniela-nacional/YYYY/MM/DD/nocturna
    """
    return f"{BASE_URL}/quiniela-nacional/{draw_date:%Y/%m/%d}/{sorteo}"


def fetch_page(url: str) -> Optional[str]:
    """GET con reintentos y manejo de errores."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            if resp.status_code == 200:
                return resp.text
            if resp.status_code == 404:
                log.debug(f"404 — sorteo no disponible: {url}")
                return None
            log.warning(f"HTTP {resp.status_code} en intento {attempt}: {url}")
        except requests.RequestException as e:
            log.warning(f"Error de red en intento {attempt}: {e}")
        if attempt < MAX_RETRIES:
            time.sleep(RETRY_DELAY * attempt)
    return None


def parse_draw(html: str, draw_date: date, sorteo_key: str) -> Optional[dict]:
    """
    Parsea el HTML y extrae los 20 números ganadores.
    Retorna dict compatible con el schema de Supabase.
    """
    soup = BeautifulSoup(html, "html.parser")

    # Intentar múltiples selectores (el sitio puede cambiar estructura)
    positions = []

    # Selector 1: tabla de resultados
    rows = soup.select("table.resultados tr, table.quiniela tr, .resultado-quiniela tr")
    for row in rows:
        cells = row.find_all(["td", "th"])
        for cell in cells:
            text = cell.get_text(strip=True)
            if text.isdigit() and len(text) <= 4:
                num = int(text)
                if 0 <= num <= 9999:
                    positions.append(num)
        if len(positions) >= 20:
            break

    # Selector 2: elementos con clases numéricas comunes
    if len(positions) < 20:
        for sel in [".numero", ".num", ".result-number", "span.numero", "td.numero"]:
            found = soup.select(sel)
            if found:
                positions = []
                for el in found:
                    t = el.get_text(strip=True).replace("°", "").strip()
                    if t.isdigit():
                        positions.append(int(t))
                if len(positions) >= 20:
                    break

    # Selector 3: todos los <td> con dígitos (heurístico)
    if len(positions) < 20:
        for td in soup.find_all("td"):
            t = td.get_text(strip=True)
            if t.isdigit() and 1 <= len(t) <= 4:
                positions.append(int(t))
        if len(positions) > 20:
            positions = positions[:20]

    if len(positions) < 1:
        log.warning(f"No se encontraron números en {sorteo_key} {draw_date}")
        return None

    # Rellenar con None si faltan posiciones
    positions = (positions + [None] * 20)[:20]

    result = {
        "draw_date": str(draw_date),
        "sorteo":    SORTEO_MAP[sorteo_key],
        "source":    "ruta1000",
    }
    for i, num in enumerate(positions, start=1):
        result[f"pos_{i}"] = num

    return result


def scrape_sorteo(draw_date: date, sorteo_key: str) -> Optional[dict]:
    """Orquesta fetch + parse para un sorteo."""
    url = build_url(draw_date, sorteo_key)
    log.info(f"Scraping: {SORTEO_MAP[sorteo_key]} {draw_date} — {url}")

    html = fetch_page(url)
    if not html:
        return None

    result = parse_draw(html, draw_date, sorteo_key)
    time.sleep(REQUEST_DELAY)
    return result


# ─── Persistencia ───────────────────────────────────────────────────────────────
def save_to_supabase(supabase, draw: dict) -> bool:
    """Upsert en tabla draws de Supabase."""
    try:
        resp = (
            supabase.table("draws")
            .upsert(draw, on_conflict="draw_date,sorteo")
            .execute()
        )
        if resp.data:
            log.info(f"✓ Guardado en Supabase: {draw['sorteo']} {draw['draw_date']}")
            return True
        log.error(f"Supabase error: {resp}")
        return False
    except Exception as e:
        log.error(f"Excepción Supabase: {e}")
        return False


def save_to_jsonl(draw: dict) -> bool:
    """Append a JSONL local como fallback."""
    try:
        DATA_DIR.mkdir(exist_ok=True)
        with open(JSONL_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(draw, ensure_ascii=False, default=str) + "\n")
        log.info(f"✓ Guardado en JSONL: {draw['sorteo']} {draw['draw_date']}")
        return True
    except Exception as e:
        log.error(f"Error escribiendo JSONL: {e}")
        return False


def already_exists(supabase, draw_date: date, sorteo_key: str) -> bool:
    """Verifica si el sorteo ya está en la DB para evitar duplicados."""
    if not supabase:
        return False
    try:
        resp = (
            supabase.table("draws")
            .select("id")
            .eq("draw_date", str(draw_date))
            .eq("sorteo", SORTEO_MAP[sorteo_key])
            .limit(1)
            .execute()
        )
        return len(resp.data) > 0
    except Exception:
        return False


# ─── Ingesta principal ──────────────────────────────────────────────────────────
def ingest_date(draw_date: date, supabase=None, force: bool = False) -> dict:
    """
    Scrapea todos los sorteos de un día.
    Retorna stats: { ok: int, skipped: int, failed: int }
    """
    stats = {"ok": 0, "skipped": 0, "failed": 0}

    # No procesar fechas futuras
    if draw_date > date.today():
        log.info(f"Saltando fecha futura: {draw_date}")
        stats["skipped"] += len(SORTEOS)
        return stats

    # No procesar fines de semana (la quiniela no sortea)
    if draw_date.weekday() >= 5:
        log.info(f"Fin de semana, sin sorteos: {draw_date}")
        stats["skipped"] += len(SORTEOS)
        return stats

    for sorteo_key in SORTEOS:
        if not force and already_exists(supabase, draw_date, sorteo_key):
            log.debug(f"Ya existe: {sorteo_key} {draw_date}")
            stats["skipped"] += 1
            continue

        draw = scrape_sorteo(draw_date, sorteo_key)
        if not draw:
            stats["failed"] += 1
            continue

        if supabase:
            ok = save_to_supabase(supabase, draw)
        else:
            ok = save_to_jsonl(draw)

        if ok:
            stats["ok"] += 1
        else:
            stats["failed"] += 1

    return stats


def ingest_range(start: date, end: date, supabase=None, force: bool = False):
    """Ingesta un rango de fechas."""
    total = {"ok": 0, "skipped": 0, "failed": 0}
    current = start
    while current <= end:
        stats = ingest_date(current, supabase, force)
        for k in total:
            total[k] += stats[k]
        current += timedelta(days=1)

    log.info(
        f"\n{'='*50}\n"
        f"RESUMEN: {total['ok']} guardados, "
        f"{total['skipped']} saltados, "
        f"{total['failed']} fallidos\n"
        f"{'='*50}"
    )
    return total


# ─── CLI ────────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Scraper de Quiniela de la Ciudad — ruta1000.com.ar"
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--date",  type=str, help="Fecha específica YYYY-MM-DD")
    group.add_argument("--days",  type=int, help="Últimos N días")
    group.add_argument("--all",   action="store_true", help="Últimos 365 días (CI/CD)")
    parser.add_argument("--force", action="store_true", help="Sobreescribir registros existentes")
    parser.add_argument("--dry-run", action="store_true", help="Solo muestra URLs, no guarda")
    args = parser.parse_args()

    supabase = None if args.dry_run else get_supabase()

    if args.dry_run:
        log.info("DRY RUN — no se guardará nada")

    today = date.today()

    if args.date:
        target = datetime.strptime(args.date, "%Y-%m-%d").date()
        ingest_date(target, supabase, args.force)

    elif args.days:
        start = today - timedelta(days=args.days - 1)
        ingest_range(start, today, supabase, args.force)

    elif args.all:
        start = today - timedelta(days=364)
        ingest_range(start, today, supabase, args.force)

    else:
        # Por defecto: hoy
        ingest_date(today, supabase, args.force)


if __name__ == "__main__":
    main()
