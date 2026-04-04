import requests, json, sys, os, time, re
from datetime import datetime, timedelta
from bs4 import BeautifulSoup

SB_URL = ""
SB_KEY = ""

try:
    with open(".env.local") as f:
        for line in f:
            line = line.strip()
            if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
                SB_URL = line.split("=",1)[1].replace('"','').strip()
            elif line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                SB_KEY = line.split("=",1)[1].replace('"','').strip()
except: pass

if not SB_URL or not SB_KEY:
    print("ERROR: Faltan variables de entorno")
    sys.exit(1)

HEADERS = {"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

TURNO_MAP = {
    "previa": "Previa",
    "primera": "Primera", 
    "la primera": "Primera",
    "matutina": "Matutina",
    "vespertina": "Vespertina",
    "nocturna": "Nocturna"
}

def scrape_quinieleando(fecha_str):
    """Scrape from quinieleando.com.ar - best source"""
    url = f"https://quinieleando.com.ar/quinielas/nacional/resultados/{fecha_str}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        if r.status_code != 200:
            # Try today URL
            url2 = "https://quinieleando.com.ar/quinielas/nacional/resultados-de-hoy"
            r = requests.get(url2, headers=HEADERS, timeout=20)
            if r.status_code != 200:
                return {}
        
        soup = BeautifulSoup(r.text, "html.parser")
        results = {}
        
        # Find all tables with sorteo data
        tables = soup.find_all("table")
        for table in tables:
            # Get turno from caption or preceding heading
            caption = table.find("caption") or table.find("th", colspan=True)
            header = ""
            # Try to find turno in table header
            first_th = table.find("th")
            if first_th:
                header = first_th.get_text().lower()
            
            # Detect turno
            turno = None
            for key, val in TURNO_MAP.items():
                if key in header:
                    turno = val
                    break
            
            if not turno:
                # Try finding turno from text before table
                prev = table.find_previous(["h2","h3","h4","caption","strong"])
                if prev:
                    txt = prev.get_text().lower()
                    for key, val in TURNO_MAP.items():
                        if key in txt:
                            turno = val
                            break
            
            if not turno:
                continue
                
            # Extract numbers from table
            nums = []
            for td in table.find_all("td"):
                text = td.get_text().strip()
                # Look for 4-digit numbers
                m = re.search(r'\b(\d{4})\b', text)
                if m:
                    n = int(m.group(1))
                    if 0 <= n <= 9999 and n not in nums:
                        nums.append(n)
                if len(nums) >= 20:
                    break
            
            if len(nums) >= 5:
                results[turno] = nums
        
        return results
    except Exception as e:
        print(f"  Error quinieleando: {e}")
        return {}

def scrape_quinielanacional(fecha_url, turno):
    """Fallback: original source"""
    url = f"https://quinielanacional1.com.ar/{fecha_url}/{turno}"
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
            except: pass
        return nums
    except: return []

def save(date_str, turno, nums):
    headers = {
        "apikey": SB_KEY,
        "Authorization": f"Bearer {SB_KEY}",
        "Content-Type": "application/json"
    }
    requests.delete(f"{SB_URL}/rest/v1/draws?date=eq.{date_str}&turno=eq.{turno}", headers=headers, timeout=10)
    r = requests.post(f"{SB_URL}/rest/v1/draws", headers={**headers,"Prefer":"return=minimal"},
        json={"date":date_str,"turno":turno,"numbers":nums,"source":"quinieleando"}, timeout=10)
    return r.status_code in [200,201]

days = 30
for i, arg in enumerate(sys.argv[1:]):
    if arg == "--days" and i+1 < len(sys.argv[1:]):
        days = int(sys.argv[i+2])
    elif arg.startswith("--days="):
        days = int(arg.split("=")[1])

TURNOS = ["Previa","Primera","Matutina","Vespertina","Nocturna"]
print(f"Cargando {days} dias de historial desde quinieleando.com.ar...")
total = 0

for i in range(days):
    fecha = datetime.now() - timedelta(days=i)
    if fecha.weekday() == 6:  # domingo
        continue
    
    fecha_db = fecha.strftime("%Y-%m-%d")
    d = fecha.day
    m = fecha.month
    y = str(fecha.year)[-2:]
    fecha_url_old = f"{d}-{m}-{y}"
    
    # Try quinieleando first
    results = scrape_quinieleando(fecha_db)
    
    if results:
        for turno, nums in results.items():
            if len(nums) >= 5:
                ok = save(fecha_db, turno, nums)
                if ok:
                    total += 1
                    print(f"  OK {fecha_db} {turno} ({len(nums)} nums) [quinieleando]")
    else:
        # Fallback to original
        for turno in TURNOS:
            nums = scrape_quinielanacional(fecha_url_old, turno)
            if len(nums) >= 5:
                ok = save(fecha_db, turno, nums)
                if ok:
                    total += 1
                    print(f"  OK {fecha_db} {turno} ({len(nums)} nums) [fallback]")
        time.sleep(0.5)

print(f"\nTotal: {total} sorteos guardados")
