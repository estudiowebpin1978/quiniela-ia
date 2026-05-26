import os, json, sys
import requests
import numpy as np
import xgboost as xgb
from collections import Counter
from datetime import datetime, timedelta
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://wazkylxgqckjfkcmfotl.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_KEY:
    print("ERROR: SUPABASE_SERVICE_ROLE_KEY env var required")
    sys.exit(1)

EXPORT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "modelos_exportados")
os.makedirs(EXPORT_DIR, exist_ok=True)

def obtener_sorteos(dias=365, turnos=None):
    url = f"{SUPABASE_URL}/rest/v1/draws"
    params = {
        "select": "date,turno,numbers",
        "order": "date.asc",
        "limit": 10000
    }
    if turnos:
        params["turno"] = f"in.({','.join(turnos)})"
    resp = requests.get(url, params=params, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}"
    })
    resp.raise_for_status()
    return resp.json()

def preparar_secuencias(sorteos, turno_filtro=None):
    secuencias = []
    for s in sorteos:
        if turno_filtro and s.get("turno", "").lower() != turno_filtro.lower():
            continue
        if not isinstance(s.get("numbers"), list) or len(s["numbers"]) < 20:
            continue
        nums = [int(n) % 100 for n in s["numbers"] if isinstance(n, (int, float)) and 0 <= n <= 9999]
        if len(nums) >= 20:
            secuencias.append(nums[:20])
    return secuencias

def crear_features_ml(secuencias, ventana=5):
    X, y = [], []
    for i in range(ventana, len(secuencias)):
        window = secuencias[i - ventana:i]
        target = secuencias[i]
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

def entrenar_xgboost(X, y):
    model = xgb.XGBClassifier(
        n_estimators=200, max_depth=6, learning_rate=0.1,
        subsample=0.8, colsample_bytree=0.8, reg_lambda=1.0,
        random_state=42, n_jobs=-1
    )
    model.fit(X, y)
    return model

def predecir_scores(model, secuencias_recientes, ventana=5):
    window = secuencias_recientes[-ventana:]
    if len(window) < ventana:
        return {str(n).zfill(2): 0.0 for n in range(100)}
    freqs = np.zeros(100)
    for seq in window:
        for n in seq:
            freqs[n] += 1
    max_f = freqs.max()
    freqs_norm = freqs / max_f if max_f > 0 else freqs
    feature_vector = np.concatenate([freqs_norm, freqs_norm[-50:], [len(window), 0]]).reshape(1, -1)
    probas = model.predict_proba(feature_vector)[0]
    scores = {}
    for n in range(100):
        if n < len(probas):
            scores[str(n).zfill(2)] = round(float(probas[n] * 100), 2)
        else:
            scores[str(n).zfill(2)] = 0.0
    return scores

def entrenar_random_forest(X, y):
    from sklearn.ensemble import RandomForestClassifier
    rf = RandomForestClassifier(n_estimators=200, max_depth=10, random_state=42, n_jobs=-1)
    rf.fit(X, y)
    return rf

def exportar_modelo(model, nombre, secuencias_recientes, ventana=5, metadata=None):
    scores = predecir_scores(model, secuencias_recientes, ventana)
    sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    export = {
        "modelo": nombre,
        "fecha_exportacion": datetime.now().isoformat(),
        "ventana": ventana,
        "feature_dim": 152,
        "scores_por_numero": scores,
        "top_10": [{"numero": n, "score": s} for n, s in sorted_scores[:10]],
        "metadata": metadata or {}
    }
    path = os.path.join(EXPORT_DIR, f"{nombre}_prediccion.json")
    with open(path, "w") as f:
        json.dump(export, f, indent=2)
    print(f"Exportado: {path} ({len(scores)} numeros, top1={sorted_scores[0][0]}={sorted_scores[0][1]})")
    return export

def entrenar_lstm_y_exportar(secuencias, ventana=10):
    try:
        import tensorflow as tf
        from tensorflow.keras.models import Sequential
        from tensorflow.keras.layers import LSTM, Dense, Dropout
    except ImportError:
        print("TensorFlow no disponible, saltando LSTM")
        return None
    X_lstm, y_lstm = [], []
    for i in range(len(secuencias) - ventana):
        ventana_datos = secuencias[i:i + ventana]
        siguiente = secuencias[i + ventana]
        X_seq = np.zeros((ventana, 100))
        for j, seq in enumerate(ventana_datos):
            for n in seq[:20]:
                X_seq[j, n % 100] = 1
        y_seq = np.zeros(100)
        for n in siguiente[:20]:
            y_seq[n % 100] = 1
        X_lstm.append(X_seq)
        y_lstm.append(y_seq)
    X_lstm, y_lstm = np.array(X_lstm), np.array(y_lstm)
    model = Sequential([
        LSTM(64, input_shape=(ventana, 100), return_sequences=True),
        Dropout(0.2),
        LSTM(32),
        Dropout(0.2),
        Dense(32, activation='relu'),
        Dense(100, activation='softmax')
    ])
    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
    model.fit(X_lstm, y_lstm, epochs=20, batch_size=32, validation_split=0.2, verbose=0)
    pesos = []
    for p in model.get_weights():
        pesos.append({"shape": list(p.shape), "data": p.tolist()})
    export = {
        "modelo": "lstm",
        "fecha_exportacion": datetime.now().isoformat(),
        "ventana": ventana,
        "n_features": 100,
        "arquitectura": "LSTM(64)->Dropout->LSTM(32)->Dropout->Dense(32)->Dense(100)",
        "pesos": pesos
    }
    path = os.path.join(EXPORT_DIR, "lstm_pesos.json")
    with open(path, "w") as f:
        json.dump(export, f, indent=2)
    print(f"Exportado LSTM: {path}")
    return export

def main():
    print("=" * 60)
    print("ENTRENAMIENTO XGBoost + RF + LSTM PARA PRODUCCION")
    print("=" * 60)
    print("\n1. Obteniendo datos...")
    sorteos = obtener_sorteos(dias=365)
    print(f"   Total sorteos: {len(sorteos)}")
    for turno in ["previa", "matutina", "vespertina", "nocturna"]:
        print(f"\n--- Turno: {turno.upper()} ---")
        secuencias = preparar_secuencias(sorteos, turno)
        if len(secuencias) < 20:
            print(f"   Datos insuficientes: {len(secuencias)} sorteos")
            continue
        print(f"   Secuencias: {len(secuencias)}")
        print(f"2. Creando features...")
        X, y = crear_features_ml(secuencias)
        print(f"   Features: {X.shape}, Labels: {len(set(y))} clases")
        print(f"3. Entrenando XGBoost...")
        xgb_model = entrenar_xgboost(X, y)
        train_acc = xgb_model.score(X, y)
        print(f"   Train accuracy: {train_acc:.2%}")
        print(f"4. Exportando scores XGBoost...")
        n_recientes = min(10, len(secuencias))
        exportar_modelo(xgb_model, f"xgboost_{turno}", secuencias[-n_recientes:],
                        metadata={"turno": turno, "sorteos_entrenados": len(secuencias), "train_accuracy": round(train_acc, 4)})
        print(f"5. Entrenando RandomForest...")
        rf_model = entrenar_random_forest(X, y)
        exportar_modelo(rf_model, f"random_forest_{turno}", secuencias[-n_recientes:],
                        metadata={"turno": turno, "sorteos_entrenados": len(secuencias)})

    print(f"\n--- Turno: TODOS (generico) ---")
    secuencias_all = preparar_secuencias(sorteos)
    if len(secuencias_all) >= 20:
        X_all, y_all = crear_features_ml(secuencias_all, ventana=10)
        if len(X_all) > 0:
            print(f"   Features: {X_all.shape}")
            print(f"Entrenando LSTM...")
            entrenar_lstm_y_exportar(secuencias_all)
    print(f"\nExportaciones completadas en: {EXPORT_DIR}")
    print("Archivos generados:")
    for f in sorted(os.listdir(EXPORT_DIR)):
        fpath = os.path.join(EXPORT_DIR, f)
        size_kb = os.path.getsize(fpath) / 1024
        print(f"   {f} ({size_kb:.1f} KB)")

if __name__ == "__main__":
    main()