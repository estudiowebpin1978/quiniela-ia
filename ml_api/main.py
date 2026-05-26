import os, json, sys
from datetime import datetime
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np

# Models dir
MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "modelos_exportados")

# Global model cache
_modelos = {}
_xgb_models = {}
_scalers = {}
_lstm_model = None

app = FastAPI(title="Quiniela IA - ML API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class PredictRequest(BaseModel):
    turno: str = "nocturna"
    features: list[float] | None = None
    ultimos_numeros: list[list[int]] | None = None

class TrainRequest(BaseModel):
    turno: str = "nocturna"
    dias: int = 365

@app.get("/health")
def health():
    return {
        "status": "ok",
        "xgboost": len(_xgb_models),
        "modelos_cargados": list(_modelos.keys()),
        "timestamp": datetime.now().isoformat()
    }

@app.get("/modelos-disponibles")
def modelos_disponibles():
    disponibles = []
    if os.path.exists(MODELS_DIR):
        for f in sorted(os.listdir(MODELS_DIR)):
            if f.endswith(".json"):
                fpath = os.path.join(MODELS_DIR, f)
                size_kb = round(os.path.getsize(fpath) / 1024, 1)
                disponibles.append({"archivo": f, "tamano_kb": size_kb})
    return {"modelos": disponibles}

@app.post("/train")
def entrenar(request: TrainRequest):
    try:
        from api_train import entrenar_turno
        resultado = entrenar_turno(turno=request.turno, dias=request.dias)
        return resultado
    except ImportError:
        import subprocess
        script = os.path.join(os.path.dirname(__file__), "..", "lib", "ml", "python", "xgboost_export.py")
        env = os.environ.copy()
        env["SUPABASE_SERVICE_ROLE_KEY"] = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        result = subprocess.run([sys.executable, script], capture_output=True, text=True, env=env)
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }

@app.post("/predict")
def predict(req: PredictRequest):
    try:
        from api_predict import predecir_turno
        return predecir_turno(turno=req.turno.lower(), features=req.features, ultimos_numeros=req.ultimos_numeros)
    except ImportError:
        pass

    turno = req.turno.lower()
    resultado = {"modelos_usados": []}
    scores_ensemble = np.zeros(100)

    # Load exported XGBoost scores for this turno
    xgb_path = os.path.join(MODELS_DIR, f"xgboost_{turno}_prediccion.json")
    if os.path.exists(xgb_path):
        with open(xgb_path) as f:
            data = json.load(f)
        for num_str, score in data.get("scores_por_numero", {}).items():
            scores_ensemble[int(num_str)] += score * 0.15
        resultado["modelos_usados"].append("xgboost")

    # Load exported RF scores for this turno
    rf_path = os.path.join(MODELS_DIR, f"random_forest_{turno}_prediccion.json")
    if os.path.exists(rf_path):
        with open(rf_path) as f:
            data = json.load(f)
        for num_str, score in data.get("scores_por_numero", {}).items():
            scores_ensemble[int(num_str)] += score * 0.10
        resultado["modelos_usados"].append("random_forest")

    # Fallback: use LSTM if available
    lstm_path = os.path.join(MODELS_DIR, "lstm_pesos.json")
    if os.path.exists(lstm_path) and req.ultimos_numeros and len(req.ultimos_numeros) >= 10:
        try:
            from api_lstm import predecir_lstm_exported
            lstm_preds = predecir_lstm_exported(req.ultimos_numeros)
            for n, score in lstm_preds.items():
                scores_ensemble[int(n)] += score * 0.20
            resultado["modelos_usados"].append("lstm")
        except ImportError:
            pass

    top_indices = np.argsort(scores_ensemble)[-10:][::-1]
    resultado["numeros"] = [{"numero": str(n).zfill(2), "score": round(float(scores_ensemble[n]), 2)} for n in top_indices]
    resultado["scores_completos"] = {str(n).zfill(2): round(float(scores_ensemble[n]), 2) for n in range(100)}
    resultado["turno"] = turno
    resultado["timestamp"] = datetime.now().isoformat()
    return resultado

@app.get("/predict")
def predict_get(
    turno: str = Query("nocturna"),
    top: int = Query(10)
):
    return predict(PredictRequest(turno=turno))

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)