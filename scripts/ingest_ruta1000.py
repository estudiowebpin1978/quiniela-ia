import requests, json, os, sys, argparse, urllib3
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from time import sleep

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

SB_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL","")
SB_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY","")

if not SB_URL:
    try:
        with open(".env.local") as f:
            for line in f:
                line=line.strip()
                if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
                    SB_URL=line.split("=",1)[1].replace('"','').strip()
                elif line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                    SB_KEY=line.split("=",1)[1].replace('"','').strip()
    except: pass

TURNOS = ["Previa","Primera","Matutina","Vespertina","Nocturna"]
BASE = "https://quinielanacional1.com.ar"

def get_numeros(url):
    try:
        r = requests.get(url, verify=False, timeout=15, headers={"User-Agent":"Mozilla/5.0"})
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, "html.parser")
        
        # Buscar solo la seccion Nacional/Ciudad - primer columna
        columna = soup.find("div", class_="columna")
        if not columna:
            return []
        
        # Buscar el titulo "Nacional" dentro de la columna
        veintenas = columna.find_all("div", class_="veintena")
        nums = []
        for v in veintenas[:2]:  # Solo las primeras 2 veintenas (20 numeros)
            divs = v.find_all("div", class_="numero")
            for d in divs:
                txt = d.text.strip()
                try:
                    n = int(txt)
                    if 0 <= n <= 9999 and n not in nums:
                        nums.append(n)
                except:
                    pass
        return nums[:20]
    except Exception as e:
        print(f"  Error fetch: {e}")
        return []

def guardar(fecha_str, turno, numeros):
    if not SB_URL or not SB_KEY:
        return False
    try:
        # Primero intentar DELETE del registro existente
        requests.delete(
            f"{SB_URL}/rest/v1/draws?date=eq.{fecha_str}&turno=eq.{turno}",
            headers={"apikey":SB_KEY,"Authorization":f"Bearer {SB_KEY}","Prefer":"return=minimal"},
            timeout=5, verify=False
        )
        # Luego insertar nuevo
        r = requests.post(
            f"{SB_URL}/rest/v1/draws",
            headers={"apikey":SB_KEY,"Authorization":f"Bearer {SB_KEY}","Content-Type":"application/json","Prefer":"return=minimal"},
            json={"date":fecha_str,"turno":turno,"numbers":numeros},
            timeout=10, verify=False
        )
        return r.status_code in [200,201,204]
    except Exception as e:
        print(f"  Error Supabase: {e}")
        return False

parser = argparse.ArgumentParser()
parser.add_argument("--days", type=int, default=7)
args = parser.parse_args()

if not SB_URL:
    print("ERROR: Configura NEXT_PUBLIC_SUPABASE_URL en .env.local")
    sys.exit(1)

print(f"Supabase: {SB_URL[:40]}...")
print(f"Descargando {args.days} dias...")

total = 0
today = datetime.now().date()

for i in range(args.days):
    fecha = today - timedelta(days=i)
    if fecha.weekday() >= 5:
        continue
    fecha_str = fecha.strftime("%Y-%m-%d")
    fecha_url = fecha.strftime("%d-%m-%y")
    print(f"\nFecha: {fecha_str}")

    for turno in TURNOS:
        url = f"{BASE}/{fecha_url}/{turno}"
        nums = get_numeros(url)
        if len(nums) >= 5:
            ok = guardar(fecha_str, turno, nums)
            if ok:
                print(f"  OK {turno} ({len(nums)} nums): {nums[:5]}")
                total += 1
            else:
                print(f"  ERROR guardando {turno}")
        else:
            print(f"  Sin datos {turno} ({len(nums)} nums)")
        sleep(0.3)

print(f"\nTotal: {total} sorteos guardados")
