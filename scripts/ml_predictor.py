import os, json, sys
import numpy as np

SB_URL = ""
SB_KEY = ""
try:
    with open(".env.local") as f:
        for line in f:
            line=line.strip()
            if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
                SB_URL=line.split("=",1)[1].replace('"','').strip()
            elif line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                SB_KEY=line.split("=",1)[1].replace('"','').strip()
except: pass

import urllib.request, urllib.error
def fetch(url):
    req = urllib.request.Request(url, headers={"apikey":SB_KEY,"Authorization":f"Bearer {SB_KEY}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

print("Cargando datos de Supabase...")
rows = fetch(f"{SB_URL}/rest/v1/draws?select=date,turno,numbers&order=date.asc&limit=5000")
print(f"Total sorteos: {len(rows)}")

from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.preprocessing import LabelEncoder
from collections import Counter
import warnings
warnings.filterwarnings("ignore")

# Construir dataset
X, y = [], []
all_nums = []

for row in rows:
    nums = [int(n)%100 for n in (row["numbers"] or [])]
    all_nums.extend(nums)

# Para cada posicion, predecir que numero sale
# Usando ventana de 10 sorteos anteriores
window = 10
for i in range(window, len(all_nums)-1):
    ventana = all_nums[i-window:i]
    siguiente = all_nums[i]
    X.append(ventana)
    y.append(siguiente)

X = np.array(X)
y = np.array(y)

print(f"Dataset: {len(X)} muestras, entrenando modelo...")

# Modelo
model = RandomForestClassifier(n_estimators=200, max_depth=8, random_state=42, n_jobs=-1)
split = int(len(X)*0.8)
model.fit(X[:split], y[:split])

# Evaluar
from sklearn.metrics import accuracy_score
pred_test = model.predict(X[split:])
acc = accuracy_score(y[split:], pred_test)
print(f"Precision del modelo: {acc*100:.2f}%")

# Predecir proximos numeros
ultima_ventana = all_nums[-window:]
proba = model.predict_proba([ultima_ventana])[0]
top10_idx = np.argsort(proba)[::-1][:10]
top10 = [(int(i), float(proba[i])) for i in top10_idx]

print("\nTop 10 numeros ML:")
for n, p in top10:
    print(f"  {str(n).zfill(2)} - probabilidad: {p*100:.2f}%")

# Guardar resultado
result = {"top10": [{"numero": str(n).zfill(2), "prob": round(p*100,3)} for n,p in top10], "accuracy": round(acc*100,2)}
with open("ml_result.json","w") as f:
    json.dump(result, f)
print("\nResultado guardado en ml_result.json")
