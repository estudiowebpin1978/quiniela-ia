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
from datetime import datetime, timedelta
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


class BacktestRequest(BaseModel):
    turno: Optional[str] = None
    model_type: str = "ensemble"
    start_date: Optional[str] = None  # YYYY-MM-DD
    end_date: Optional[str] = None    # YYYY-MM-DD
    train_days: int = 365
    test_days: int = 30


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


@app.post("/api/backtest", dependencies=[Depends(verify_api_key)])
async def run_backtest(req: BacktestRequest, background_tasks: BackgroundTasks):
    """Run historical backtest for a model type across turnos."""
    start = time.time()
    turnos_to_test = [req.turno.lower()] if req.turno else TURNOS
    
    end_date = datetime.fromisoformat(req.end_date) if req.end_date else datetime.now()
    start_date = datetime.fromisoformat(req.start_date) if req.start_date else end_date - timedelta(days=req.test_days)
    
    results = []
    
    for turno in turnos_to_test:
        try:
            logger.info(f"Backtesting {req.model_type} for {turno}...")
            draws = _fetch_draws(turno, limit=10000)
            if len(draws) < req.train_days + req.test_days:
                logger.warning(f"{turno}: insufficient data for backtest")
                continue
            
            # Filter draws within date range
            test_draws = [d for d in draws 
                         if start_date <= datetime.fromisoformat(d["date"]) <= end_date
                         and isinstance(d.get("numbers"), list) 
                         and len(d["numbers"]) >= 20]
            
            if not test_draws:
                continue
            
            # For each test date, train on previous data and predict
            for test_draw in test_draws:
                test_date = datetime.fromisoformat(test_draw["date"])
                train_cutoff = test_date - timedelta(days=1)
                
                # Get training data (before test date)
                train_draws = [d for d in draws 
                              if datetime.fromisoformat(d["date"]) < train_cutoff
                              and isinstance(d.get("numbers"), list) 
                              and len(d["numbers"]) >= 20]
                
                if len(train_draws) < 60:
                    continue
                
                train_seqs, train_dates = _prepare_sequences(train_draws)
                if len(train_seqs) < 60:
                    continue
                
                # Train model
                if req.model_type == "ensemble":
                    lgbm_scores, xgb_scores, ensemble_scores = train_lgbm_xgboost(train_seqs, train_dates)
                    pred_scores = ensemble_scores
                elif req.model_type == "lgbm":
                    lgbm_scores, _, _ = train_lgbm_xgboost(train_seqs, train_dates)
                    pred_scores = lgbm_scores
                elif req.model_type == "xgboost":
                    _, xgb_scores, _ = train_lgbm_xgboost(train_seqs, train_dates)
                    pred_scores = xgb_scores
                else:
                    continue
                
                # Get actual result
                actual_numbers = [int(n) % 100 for n in test_draw["numbers"][:20] if isinstance(n, (int, float))]
                actual_top = actual_numbers[0] if actual_numbers else None
                
                # Rank predictions
                ranked = sorted(pred_scores.items(), key=lambda x: x[1], reverse=True)
                top_1 = [int(r[0]) for r in ranked[:1]]
                top_5 = [int(r[0]) for r in ranked[:5]]
                top_10 = [int(r[0]) for r in ranked[:10]]
                
                # Calculate hits
                hit_1 = actual_top in top_1 if actual_top else False
                hit_5 = actual_top in top_5 if actual_top else False
                hit_10 = actual_top in top_10 if actual_top else False
                
                # Find rank of actual
                rank = None
                score = 0
                for i, (num, sc) in enumerate(ranked):
                    if int(num) == actual_top:
                        rank = i + 1
                        score = sc
                        break
                
                # Simulate ROI (bet $10 on each top-10, payout ~$70 per hit)
                roi = 0
                if actual_top:
                    if hit_1: roi += 70 - 100  # win $70, cost $100
                    elif hit_5: roi += 70 - 100
                    elif hit_10: roi += 70 - 100
                    else: roi -= 100  # lose all
                
                # Save to backtest_results
                _save_backtest_result(
                    turno=turno,
                    model_type=req.model_type,
                    test_date=test_date.date(),
                    train_start=(train_cutoff - timedelta(days=req.train_days)).date(),
                    train_end=train_cutoff.date(),
                    hit_1=hit_1, hit_5=hit_5, hit_10=hit_10,
                    rank=rank, score=score, roi=roi
                )
                
                results.append({
                    "turno": turno,
                    "test_date": test_date.date().isoformat(),
                    "hit_1": hit_1, "hit_5": hit_5, "hit_10": hit_10,
                    "rank": rank, "roi": roi
                })
                
        except Exception as e:
            logger.error(f"{turno}: backtest failed - {e}")
    
    duration_ms = int((time.time() - start) * 1000)
    return {
        "ok": len(results) > 0,
        "model_type": req.model_type,
        "turnos_tested": turnos_to_test,
        "tests_run": len(results),
        "duration_ms": duration_ms,
        "timestamp": datetime.now().isoformat(),
        "summary": _summarize_backtest(results)
    }


@app.get("/api/backtest/summary")
async def get_backtest_summary(turno: Optional[str] = None, model_type: Optional[str] = None):
    """Get aggregated backtest metrics from Supabase."""
    try:
        params = {"select": "turno,model_type,hit_at_1_2c,hit_at_5_2c,hit_at_10_2c,roi_2c,test_date"}
        if turno:
            params["turno"] = f"eq.{turno}"
        if model_type:
            params["model_type"] = f"eq.{model_type}"
        params["order"] = "test_date.desc"
        params["limit"] = 1000
        
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/backtest_results",
            params=params,
            headers=SB_HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        rows = r.json()
        
        if not rows:
            return {"ok": True, "message": "No backtest data yet", "data": []}
        
        # Aggregate by model_type and turno
        from collections import defaultdict
        agg = defaultdict(lambda: {"count": 0, "hits_1": 0, "hits_5": 0, "hits_10": 0, "roi_sum": 0.0})
        
        for row in rows:
            key = f"{row['turno']}/{row['model_type']}"
            agg[key]["count"] += 1
            agg[key]["hits_1"] += int(row.get("hit_at_1_2c", False))
            agg[key]["hits_5"] += int(row.get("hit_at_5_2c", False))
            agg[key]["hits_10"] += int(row.get("hit_at_10_2c", False))
            agg[key]["roi_sum"] += float(row.get("roi_2c", 0))
        
        summary = []
        for key, v in agg.items():
            t, m = key.split("/")
            summary.append({
                "turno": t,
                "model_type": m,
                "total_tests": v["count"],
                "hit_at_1_pct": round(100.0 * v["hits_1"] / v["count"], 2),
                "hit_at_5_pct": round(100.0 * v["hits_5"] / v["count"], 2),
                "hit_at_10_pct": round(100.0 * v["hits_10"] / v["count"], 2),
                "avg_roi": round(v["roi_sum"] / v["count"], 2),
            })
        
        return {"ok": True, "data": summary}
    except Exception as e:
        logger.error(f"Backtest summary failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _save_backtest_result(turno: str, model_type: str, test_date, train_start, train_end,
                          hit_1: bool, hit_5: bool, hit_10: bool, rank: Optional[int], 
                          score: float, roi: float):
    """Insert backtest result into Supabase."""
    payload = {
        "turno": turno,
        "model_type": model_type,
        "test_date": test_date.isoformat(),
        "train_window_start": train_start.isoformat(),
        "train_window_end": train_end.isoformat(),
        "hit_at_1_2c": hit_1,
        "hit_at_5_2c": hit_5,
        "hit_at_10_2c": hit_10,
        "rank_2c": rank,
        "score_2c": round(score, 4),
        "roi_2c": round(roi, 2),
    }
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/backtest_results",
        json=payload,
        headers={**SB_HEADERS, "Prefer": "resolution=merge-duplicates"},
        timeout=10,
    )
    if not r.ok:
        logger.error(f"Backtest save failed: {r.status_code} {r.text[:200]}")


def _summarize_backtest(results: list) -> dict:
    if not results:
        return {}
    total = len(results)
    hits_1 = sum(1 for r in results if r["hit_1"])
    hits_5 = sum(1 for r in results if r["hit_5"])
    hits_10 = sum(1 for r in results if r["hit_10"])
    avg_roi = sum(r["roi"] for r in results) / total
    return {
        "total_tests": total,
        "hit_at_1_pct": round(100.0 * hits_1 / total, 2),
        "hit_at_5_pct": round(100.0 * hits_5 / total, 2),
        "hit_at_10_pct": round(100.0 * hits_10 / total, 2),
        "avg_roi": round(avg_roi, 2),
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
