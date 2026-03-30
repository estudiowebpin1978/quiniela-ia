import requests, json, sys, os, time
from datetime import datetime, timedelta
from bs4 import BeautifulSoup

SB_URL = ""
SB_KEY = ""

# Leer .env.local
try:
    with open(".env.local") as f:
        for line in f:
            line = line.strip()
            if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
                SB_URL = line.split("=",1)[1].replace('"','').strip()
            elif line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                SB_KEY = line.split("=",1)[1].replace('"','').strip()
except:
    pass

if not SB_URL or not SB_KEY:
    print("ERROR: Faltan variables de entorno en .env.local")
    sys.exit(1)

TURNOS = ["Previa","Primera","Matutina","Vespertina","Nocturna"]
HEADERS = {"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

def scrape(fecha_str, turno):
    url = f"https://quinielanacional1.com.ar/{fecha_str}/{turno}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, "html.parser")
        nums = []
        for el in soup.find_all(class_="numero"):
            try:
                n = int(el.text.strip())
                if 0 <= n <= 9999 and n not in nums:
                    nums.append(n)
                if len(nums) >= 20:
                    break
            except:
                pass
        return nums
    except Exception as e:
        return []

def save(date_str, turno, nums):
    headers = {
        "apikey": SB_KEY,
        "Authorization": f"Bearer {SB_KEY}",
        "Content-Type": "application/json"
    }
    # Eliminar existente
    requests.delete(
        f"{SB_URL}/rest/v1/draws?date=eq.{date_str}&turno=eq.{turno}",
        headers=headers, timeout=10
    )
    # Insertar nuevo
    r = requests.post(
        f"{SB_URL}/rest/v1/draws",
        headers={**headers, "Prefer": "return=minimal"},
        json={"date": date_str, "turno": turno, "numbers": nums, "source": "ingest_ruta1000"},
        timeout=10
    )
    return r.status_code in [200, 201]

days = 730
for arg in sys.argv[1:]:
    if arg.startswith("--days="):
        days = int(arg.split("=")[1])
    elif arg == "--days" and sys.argv.index(arg)+1 < len(sys.argv):
        days = int(sys.argv[sys.argv.index(arg)+1])

print(f"Cargando {days} dias de historial...")
total = 0
errors = 0

for i in range(days):
    fecha = datetime.now() - timedelta(days=i)
    # Quiniela no sortea domingos
    if fecha.weekday() == 6:
        continue
    d = fecha.day
    m = fecha.month
    y = str(fecha.year)[-2:]
    fecha_url = f"{d}-{m}-{y}"
    fecha_db = fecha.strftime("%Y-%m-%d")

    for turno in TURNOS:
        nums = scrape(fecha_url, turno)
        if len(nums) >= 5:
            ok = save(fecha_db, turno, nums)
            if ok:
                total += 1
                print(f"  OK {fecha_db} {turno} ({len(nums)} nums)")
            else:
                errors += 1
        time.sleep(0.3)

print(f"\nTotal: {total} sorteos guardados, {errors} errores")
