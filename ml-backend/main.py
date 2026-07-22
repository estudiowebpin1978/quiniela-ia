"""
Quiniela IA - ML Backend (FastAPI)
Microservicio independiente para entrenamiento y predicción de modelos ML.
Se comunica con Supabase para leer datos y escribir resultados.
Autenticación: API Key via header X-API-Key.
"""
import os
import json
import time
import logging
from datetime import datetime
from typing import Optional
from contextlib import asynccontextmanager

import numpy as np
import requests
from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

from config import SUPABASE_URL, SUPABASE_KEY, ML_API_PORT, ML_API_HOST, TURNOS
from core.predictor import PredictorQuiniela
from core.data import cargar_desde_supabase
from core.lgbm_xgboost import train_lgbm_xgboost, predict_scores_lgbm_xgboost

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("quiniela-ml")

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

# === API KEY AUTHENTICATION ===
PYTHON_API_SECRET = os.getenv("PYTHON_API_SECRET", "")


def verify_api_key(request):
    """Validate X-API-Key from request headers. Returns None on success, raises HTTPException on failure."""
    if not PYTHON_API_SECRET:
        return
    api_key = request.headers.get("X-API-Key")
    if api_key != PYTHON_API_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Acceso denegado. Token inválido.",
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("ML Backend starting up...")
    yield
    logger.info("ML Backend shutting down...")


app = FastAPI(
    title="Quiniela IA - ML Backend",
    description="Microservicio de ML para predicciones de quiniela",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TrainRequest(BaseModel):
    turno: Optional[str] = None
    force: bool = False


class PredictRequest(BaseModel):
    turno: str
    top_n: int = 10


class TrainResponse(BaseModel):
    ok: bool
    turno: str
    models_trained: list[str]
    duration_ms: int
    timestamp: str


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "quiniela-ml-backend",
        "timestamp": datetime.now().isoformat(),
        "supabase_connected": bool(SUPABASE_URL and SUPABASE_KEY),
    }


@app.post("/api/train", dependencies=[Depends(verify_api_key)])
async def train_models(req: TrainRequest, background_tasks: BackgroundTasks):
    start = time.time()
    turnos_to_train = [req.turno.lower()] if req.turno else TURNOS
    models_trained = []

    for turno in turnos_to_train:
        try:
            logger.info(f"Training models for {turno}...")
            draws = _fetch_draws(turno)
            if len(draws) < 60:
                logger.warning(f"{turno}: insufficient data ({len(draws)} draws)")
                continue

            seqs, dates = _prepare_sequences(draws)
            if len(seqs) < 60:
                logger.warning(f"{turno}: insufficient sequences ({len(seqs)})")
                continue

            lgbm_scores, xgb_scores, ensemble_scores = train_lgbm_xgboost(seqs, dates)

            _upload_to_supabase(turno, "lgbm", lgbm_scores, len(seqs))
            _upload_to_supabase(turno, "xgboost", xgb_scores, len(seqs))
            _upload_to_supabase(turno, "ensemble", ensemble_scores, len(seqs))

            models_trained.extend([f"lgbm_{turno}", f"xgboost_{turno}", f"ensemble_{turno}"])
            logger.info(f"{turno}: training complete")

        except Exception as e:
            logger.error(f"{turno}: training failed - {e}")

    duration_ms = int((time.time() - start) * 1000)
    return TrainResponse(
        ok=len(models_trained) > 0,
        turno=req.turno or "all",
        models_trained=models_trained,
        duration_ms=duration_ms,
        timestamp=datetime.now().isoformat(),
    )


@app.post("/api/predict")
async def predict(req: PredictRequest):
    start = time.time()

    try:
        cached = _get_cached_predictions(req.turno)
        if cached and not req.force:
            return {
                "ok": True,
                "turno": req.turno,
                "source": "cache",
                "scores": cached,
                "duration_ms": int((time.time() - start) * 1000),
            }
    except Exception:
        pass

    try:
        draws = _fetch_draws(req.turno)
        if len(draws) < 60:
            raise HTTPException(status_code=400, detail=f"Insufficient data: {len(draws)} draws")

        seqs, dates = _prepare_sequences(draws)
        predictor = PredictorQuiniela(usar_xgboost=True)
        historico, turnos_list = _load_full_history(draws)
        resultado = predictor.predecir(historico, turnos_list, req.turno, top_n_2=req.top_n)

        scores = {}
        for r in resultado.get("predicciones_2cifras", []):
            scores[r["numero"]] = r["score"]

        return {
            "ok": True,
            "turno": req.turno,
            "source": "live",
            "scores": scores,
            "top_10": resultado.get("predicciones_2cifras", [])[:req.top_n],
            "predicciones_3cifras": resultado.get("predicciones_3cifras", []),
            "predicciones_4cifras": resultado.get("predicciones_4cifras", []),
            "redoblona": resultado.get("redoblona"),
            "duration_ms": int((time.time() - start) * 1000),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Predict failed for {req.turno}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/predict/{turno}")
async def predict_get(turno: str, top: int = 10):
    req = PredictRequest(turno=turno.lower(), top_n=top)
    return await predict(req)


@app.get("/api/status")
async def model_status():
    model_status = {}
    for turno in TURNOS:
        try:
            r = requests.get(
                f"{SUPABASE_URL}/rest/v1/ml_models",
                params={"select": "turno,updated_at", "turno": f"ilike.*{turno}*", "order": "updated_at.desc", "limit": 3},
                headers=SB_HEADERS,
                timeout=5,
            )
            rows = r.json() if r.ok else []
            model_status[turno] = {
                "has_models": len(rows) > 0,
                "last_updated": rows[0].get("updated_at") if rows else None,
            }
        except Exception:
            model_status[turno] = {"has_models": False, "last_updated": None}

    return {
        "ok": True,
        "models": model_status,
        "timestamp": datetime.now().isoformat(),
    }


def _fetch_draws(turno: str, limit: int = 10000) -> list[dict]:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/draws",
        params={
            "select": "date,turno,numbers",
            "turno": f"ilike.*{turno}*",
            "order": "date.asc",
            "limit": limit,
        },
        headers=SB_HEADERS,
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def _prepare_sequences(draws: list[dict]) -> tuple[list[list[int]], list[str]]:
    seqs, dates = [], []
    for d in draws:
        if not isinstance(d.get("numbers"), list) or len(d["numbers"]) < 20:
            continue
        nums = [int(n) % 100 for n in d["numbers"] if isinstance(n, (int, float)) and 0 <= n <= 9999]
        if len(nums) >= 20:
            seqs.append(nums[:20])
            dates.append(d.get("date", ""))
    return seqs, dates


def _load_full_history(draws: list[dict]) -> tuple[list[list[int]], list[str]]:
    historico, turnos = [], []
    for d in draws:
        if not isinstance(d.get("numbers"), list) or len(d["numbers"]) < 20:
            continue
        nums = [int(n) for n in d["numbers"] if isinstance(n, (int, float)) and 0 <= n <= 9999]
        if len(nums) >= 20:
            historico.append(nums[:20])
            turnos.append(d.get("turno", "Nocturna"))
    return historico, turnos


def _upload_to_supabase(turno: str, model_type: str, scores: dict, n_draws: int):
    modelos = [{
        "tipo": model_type,
        "nombre": f"{model_type.upper()} {turno}",
        "precision": 0,
        "fechaEntrenamiento": datetime.now().isoformat(),
        "modelo": {"scores_por_numero": scores},
    }]
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/ml_models",
        json={
            "turno": f"{model_type}_{turno}",
            "modelos": json.dumps(modelos),
            "updated_at": datetime.now().isoformat(),
        },
        headers={**SB_HEADERS, "Prefer": "resolution=merge-duplicates"},
        timeout=10,
    )
    if not r.ok:
        logger.error(f"Upload failed for {model_type}_{turno}: {r.status_code} {r.text[:200]}")


def _get_cached_predictions(turno: str) -> Optional[dict]:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/ml_models",
        params={
            "select": "turno,modelos,updated_at",
            "turno": f"eq.ensemble_{turno}",
            "order": "updated_at.desc",
            "limit": 1,
        },
        headers=SB_HEADERS,
        timeout=5,
    )
    if not r.ok:
        return None
    rows = r.json()
    if not rows:
        return None
    updated = rows[0].get("updated_at", "")
    if updated:
        try:
            dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            age_hours = (datetime.now().astimezone() - dt).total_seconds() / 3600
            if age_hours > 6:
                return None
        except Exception:
            return None
    try:
        modelos = json.loads(rows[0]["modelos"])
        for m in modelos:
            if m.get("modelo", {}).get("scores_por_numero"):
                return m["modelo"]["scores_por_numero"]
    except Exception:
        pass
    return None


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=ML_API_HOST, port=ML_API_PORT)
