"""
Modelo XGBoost con calibración probabilística.
Entrena un clasificador y calibra sus salidas a probabilidades reales.
"""
import numpy as np
import json
import os
from datetime import datetime

try:
    import xgboost as xgb
    XGB_DISPONIBLE = True
except ImportError:
    XGB_DISPONIBLE = False

from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import train_test_split


def crear_features_ml(secuencias_2d: list[list[int]], ventana: int = 5) -> tuple[np.ndarray, np.ndarray]:
    """
    Prepara features para ML a partir de secuencias de 2 dígitos.
    
    Cada feature vector contiene:
    - 100 frecuencias normalizadas de cada número (0-99)
    - 100 frecuencias de ventana completa
    - metadatos
    
    Args:
        secuencias_2d: lista de sorteos, cada uno con lista de 20 números (0-99)
        ventana: cantidad de sorteos hacia atrás para mirar
    
    Returns:
        X: array (n_muestras, n_features)
        y: array (n_muestras,) con etiquetas 0-99
    """
    X, y = [], []
    for i in range(ventana, len(secuencias_2d)):
        window = secuencias_2d[i - ventana:i]
        target = secuencias_2d[i]
        freqs = np.zeros(100)
        for seq in window:
            for n in seq:
                freqs[n] += 1
        max_f = freqs.max()
        freqs_norm = freqs / max_f if max_f > 0 else freqs
        # Feature vector: frecuencias + tendencia + metadatos
        feature_vector = np.concatenate([freqs_norm, freqs_norm[-50:], [len(window), 0]])
        # Una muestra por cada número único en el target (top 10)
        for t in set(target[:10]):
            X.append(feature_vector)
            y.append(t)
    return np.array(X), np.array(y)


def entrenar_xgboost(X: np.ndarray, y: np.ndarray, calibrar: bool = True) -> tuple:
    """
    Entrena XGBoost con calibración Platt/isotónica.
    
    Args:
        X: features
        y: etiquetas (0-99)
        calibrar: si aplicar calibración probabilística
    
    Returns:
        (modelo, calibrated_model) si calibrar=True, sino (modelo, modelo)
    """
    if not XGB_DISPONIBLE:
        raise ImportError("XGBoost no está instalado. pip install xgboost")
    
    # Dividir para calibración
    if calibrar and len(X) >= 200:
        X_train, X_cal, y_train, y_cal = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
    else:
        X_train, y_train = X, y
    
    # Entrenar XGBoost
    model = xgb.XGBClassifier(
        n_estimators=300, max_depth=8, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8,
        reg_lambda=2.0, reg_alpha=1.0,
        tree_method='hist', random_state=42,
        n_jobs=-1, eval_metric='mlogloss',
        use_label_encoder=False
    )
    model.fit(X_train, y_train)
    
    # Calibrar
    calibrated = None
    if calibrar and len(X) >= 200:
        calibrated = CalibratedClassifierCV(
            estimator=xgb.XGBClassifier(
                n_estimators=200, max_depth=6, learning_rate=0.1,
                subsample=0.8, colsample_bytree=0.8,
                reg_lambda=1.0, tree_method='hist',
                random_state=42, n_jobs=-1
            ),
            method='isotonic', cv=3
        )
        calibrated.fit(X_cal, y_cal)
    
    return model, calibrated


def predecir_probabilidades(
    model, 
    calibrated_model, 
    secuencias_2d_recientes: list[list[int]], 
    ventana: int = 5
) -> dict[str, float]:
    """
    Predice probabilidades para cada número 00-99.
    
    Combina XGBoost crudo + calibrado para mejor estimación.
    
    Returns:
        dict: "00" -> probabilidad (0-100)
    """
    n_recientes = min(ventana, len(secuencias_2d_recientes))
    window = secuencias_2d_recientes[-n_recientes:]
    
    if len(window) < ventana:
        return {str(n).zfill(2): 0.0 for n in range(100)}
    
    # Feature vector
    freqs = np.zeros(100)
    for seq in window:
        for n in seq:
            freqs[n] += 1
    max_f = freqs.max()
    freqs_norm = freqs / max_f if max_f > 0 else freqs
    feature_vector = np.concatenate([freqs_norm, freqs_norm[-50:], [len(window), 0]]).reshape(1, -1)
    
    # Obtener probabilidades
    probas_raw = model.predict_proba(feature_vector)[0]
    
    probas_calib = None
    if calibrated_model is not None:
        try:
            probas_calib = calibrated_model.predict_proba(feature_vector)[0]
        except Exception:
            pass
    
    # Combinar: promedio ponderado (más peso al calibrado si existe)
    scores = {}
    for n in range(100):
        p_raw = probas_raw[n] if n < len(probas_raw) else 0.0
        p_cal = probas_calib[n] if probas_calib is not None and n < len(probas_calib) else p_raw
        # Ponderar: 40% raw, 60% calibrado
        p = p_raw * 0.4 + p_cal * 0.6
        scores[str(n).zfill(2)] = round(float(p * 100), 2)
    
    return scores


def exportar_modelo_json(
    model_name: str,
    scores: dict[str, float],
    metadata: dict | None = None,
    export_dir: str = "modelos_exportados"
) -> str:
    """
    Exporta predicciones del modelo a JSON para usar en TypeScript.
    """
    os.makedirs(export_dir, exist_ok=True)
    sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    export = {
        "modelo": model_name,
        "fecha_exportacion": datetime.now().isoformat(),
        "scores_por_numero": scores,
        "top_10": [{"numero": n, "score": s} for n, s in sorted_scores[:10]],
        "metadata": metadata or {}
    }
    path = os.path.join(export_dir, f"{model_name}_prediccion.json")
    with open(path, "w") as f:
        json.dump(export, f, indent=2)
    print(f"Exportado: {path}")
    return path
