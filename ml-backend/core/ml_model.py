"""Modelo XGBoost con calibración probabilística."""
import numpy as np

try:
    import xgboost as xgb
    XGB_DISPONIBLE = True
except ImportError:
    XGB_DISPONIBLE = False

try:
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.model_selection import train_test_split
    SKLEARN_DISPONIBLE = True
except ImportError:
    SKLEARN_DISPONIBLE = False
    CalibratedClassifierCV = None
    train_test_split = None


def crear_features_ml(secuencias_2d, ventana=5):
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
        feature_vector = np.concatenate([freqs_norm, freqs_norm[-50:], [len(window), 0]])
        for t in set(target[:10]):
            X.append(feature_vector)
            y.append(t)
    return np.array(X), np.array(y)


def entrenar_xgboost(X, y, calibrar=True):
    if not XGB_DISPONIBLE:
        raise ImportError("XGBoost no está instalado")
    X_train, y_train = X, y
    X_cal, y_cal = X, y
    if calibrar and SKLEARN_DISPONIBLE and len(X) >= 200:
        X_train, X_cal, y_train, y_cal = train_test_split(X, y, test_size=0.2, random_state=42)

    model = xgb.XGBClassifier(
        n_estimators=300, max_depth=8, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, reg_lambda=2.0, reg_alpha=1.0,
        tree_method='hist', random_state=42, n_jobs=-1, eval_metric='mlogloss',
        use_label_encoder=False
    )
    model.fit(X_train, y_train)

    calibrated = None
    if calibrar and SKLEARN_DISPONIBLE and len(X) >= 200:
        try:
            calibrated = CalibratedClassifierCV(
                estimator=xgb.XGBClassifier(
                    n_estimators=200, max_depth=6, learning_rate=0.1,
                    subsample=0.8, colsample_bytree=0.8, reg_lambda=1.0,
                    tree_method='hist', random_state=42, n_jobs=-1
                ),
                method='isotonic', cv=3
            )
            calibrated.fit(X_cal, y_cal)
        except Exception:
            calibrated = None

    return model, calibrated


def predecir_probabilidades(model, calibrated_model, secuencias_2d_recientes, ventana=5):
    n_recientes = min(ventana, len(secuencias_2d_recientes))
    window = secuencias_2d_recientes[-n_recientes:]
    if len(window) < ventana:
        return {str(n).zfill(2): 0.0 for n in range(100)}

    freqs = np.zeros(100)
    for seq in window:
        for n in seq:
            freqs[n] += 1
    max_f = freqs.max()
    freqs_norm = freqs / max_f if max_f > 0 else freqs
    feature_vector = np.concatenate([freqs_norm, freqs_norm[-50:], [len(window), 0]]).reshape(1, -1)

    probas_raw = model.predict_proba(feature_vector)[0]
    probas_calib = None
    if calibrated_model is not None:
        try:
            probas_calib = calibrated_model.predict_proba(feature_vector)[0]
        except Exception:
            pass

    scores = {}
    for n in range(100):
        p_raw = probas_raw[n] if n < len(probas_raw) else 0.0
        p_cal = probas_calib[n] if probas_calib is not None and n < len(probas_calib) else p_raw
        p = p_raw * 0.4 + p_cal * 0.6
        scores[str(n).zfill(2)] = round(float(p * 100), 2)

    return scores
