import requests, os, json, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib", "ml", "python"))
from config import SUPABASE_URL, SUPABASE_KEY

headers = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}', 'Content-Type': 'application/json'}
EXPORT_DIR = os.path.join(os.path.dirname(__file__), "..", "modelos_exportados")
TURNOS = ["previa", "primera", "matutina", "vespertina", "nocturna"]

# Upload Deep Learning predictions to ml_models (scores only, not weights)
print("=== Uploading Deep Learning predictions to ml_models ===")
for turno in TURNOS:
    dl_path = os.path.join(EXPORT_DIR, f"deep_learning_{turno}.json")
    if not os.path.exists(dl_path):
        continue
    
    with open(dl_path) as f:
        dl_data = json.load(f)
    
    dl_light = {
        "ensemble": dl_data.get("ensemble", {}),
        "bnn": {"uncertainty": dl_data.get("bnn", {}).get("uncertainty", {})} if dl_data.get("bnn") else None,
        "lstm_top10": dl_data.get("lstm", {}).get("top10", []),
        "transformer_top10": dl_data.get("transformer", {}).get("top10", []),
        "lstm_accuracy": dl_data.get("lstm", {}).get("accuracy", 0),
        "transformer_accuracy": dl_data.get("transformer", {}).get("accuracy", 0),
        "n_draws": dl_data.get("n_draws", 0),
        "timestamp": dl_data.get("timestamp", "")
    }
    
    modelos = [{
        "tipo": "deep-learning",
        "nombre": f"DL Ensemble {turno}",
        "precision": 0,
        "fechaEntrenamiento": dl_data.get("timestamp", ""),
        "modelo": dl_light
    }]
    
    r = requests.post(f'{SUPABASE_URL}/rest/v1/ml_models', json={
        "turno": f"dl_{turno}",
        "modelos": json.dumps(modelos),
        "updated_at": __import__("datetime").datetime.now().isoformat()
    }, headers={**headers, "Prefer": "resolution=merge-duplicates"})
    status = "OK" if r.ok else f"ERROR {r.status_code}: {r.text[:100]}"
    print(f"  dl_{turno}: {status}")

print("\n=== Done ===")
