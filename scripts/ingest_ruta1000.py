import os,sys,json,time,argparse
from datetime import datetime,timedelta
from urllib.request import urlopen,Request
from urllib.error import URLError

SUPABASE_URL=""
SUPABASE_KEY=""

try:
    with open(".env.local") as f:
        for line in f:
            line=line.strip()
            if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
                SUPABASE_URL=line.split("=",1)[1].strip().replace('"','')
            elif line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                SUPABASE_KEY=line.split("=",1)[1].strip().replace('"','')
except:pass

TURNOS={"previa":"Previa","primera":"Primera","matutina":"Matutina","vespertina":"Vespertina","nocturna":"Nocturna"}

def fetch(url):
    req=Request(url,headers={"User-Agent":"Mozilla/5.0"})
    try:
        with urlopen(req,timeout=15) as r:return r.read().decode("utf-8",errors="ignore")
    except:return None

def parse_nums(html):
    import re
    nums=[]
    for m in re.findall(r'\b(\d{1,4})\b',html):
        n=int(m)
        if 0<=n<=9999 and n not in nums:nums.append(n)
        if len(nums)>=20:break
    return nums

def upsert(date_str,turno,numbers):
    if not SUPABASE_URL:print("ERROR: Variables no configuradas");return False
    url=f"{SUPABASE_URL}/rest/v1/draws"
    data=json.dumps({"date":date_str,"turno":turno,"numbers":numbers}).encode()
    headers={"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}","Content-Type":"application/json","Prefer":"resolution=merge-duplicates"}
    req=Request(url,data=data,headers=headers,method="POST")
    try:
        with urlopen(req,timeout=10) as r:return r.status in[200,201,204]
    except Exception as e:print(f"  Error Supabase: {e}");return False

def scrape_day(date):
    date_str=date.strftime("%Y-%m-%d")
    d,m,y=date.strftime("%d"),date.strftime("%m"),date.strftime("%Y")
    saved=0
    for turno,name in TURNOS.items():
        url=f"https://www.quinielanacional.ruta1000.com.ar/resultados/{y}/{m}/{d}/{turno}"
        html=fetch(url)
        if html:
            nums=parse_nums(html)
            if len(nums)>=5:
                if upsert(date_str,name,nums):
                    print(f"  OK {date_str} {name}: {nums[:5]}")
                    saved+=1
        time.sleep(0.3)
    return saved

parser=argparse.ArgumentParser()
parser.add_argument("--days",type=int,default=30)
args=parser.parse_args()
if not SUPABASE_URL:print("ERROR: Configura .env.local");sys.exit(1)
print(f"Scrapeando {args.days} dias...")
total=0
today=datetime.now().date()
for i in range(args.days):
    date=today-timedelta(days=i)
    if date.weekday()>=5:continue
    print(f"Fecha: {date}")
    total+=scrape_day(date)
print(f"Total: {total} sorteos guardados")
