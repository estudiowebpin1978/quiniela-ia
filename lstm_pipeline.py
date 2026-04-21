import os
import json
import requests
import numpy as np
import pickle
from datetime import datetime, timedelta
from collections import Counter

SUPABASE_URL = "https://wazkylxgqckjfkcmfotl.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhemt5bHhncWNramZrY21mb3RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNDc3NTUsImV4cCI6MjA4NzgyMzc1NX0.t_P2iF1eqEo1cqBXt3R4GQV2_XzVQ0VIq_2f6VS_Q2Y"

LSTM_MODEL_PATH = "modelo_lstm_prod.json"
HISTORY_PATH = "lstm_history.json"
WEIGHTS_PATH = "lstm_weights.json"

def obtener_datos(dias=365):
    desde = (datetime.now() - timedelta(days=dias)).strftime('%Y-%m-%d')
    url = f"{SUPABASE_URL}/rest/v1/quiniela_nacional"
    params = {
        'select': 'fecha,turno,resultados',
        'fecha': f'gte.{desde}',
        'order': 'fecha.desc,turno'
    }
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}'
    }
    
    resp = requests.get(url, params=params, headers=headers)
    if resp.status_code != 200:
        print(f"Error: {resp.status_code}")
        return []
    
    datos = resp.json()
    print(f"Datos obtenidos: {len(datos)} registros")
    return datos

def preparar_secuencias(datos):
    secuencias = []
    fecha_actual = None
    nums = []
    
    for reg in datos:
        if reg['fecha'] != fecha_actual:
            if nums:
                secuencias.append({'fecha': fecha_actual, 'secuencia': nums[:20]})
            fecha_actual = reg['fecha']
            nums = []
        
        if reg['resultados'] and isinstance(reg['resultados'], list):
            for r in reg['resultados']:
                n = int(r['numero']) if isinstance(r, dict) else int(r)
                if 0 <= n <= 9999:
                    nums.append(n)
    
    if nums:
        secuencias.append({'fecha': fecha_actual, 'secuencia': nums[:20]})
    
    return secuencias

def preparar_datos_lstm(secuencias, ventana=10):
    X, y = [], []
    
    for i in range(len(secuencias) - ventana):
        ventana_datos = secuencias[i:i + ventana]
        siguiente = secuencias[i + ventana]
        
        X_seq = []
        for s in ventana_datos:
            seq = s['secuencia']
            vec = np.zeros(100)
            for num in seq[:20]:
                vec[num % 100] = 1
            X_seq.append(vec.tolist())
        
        y_seq = np.zeros(100)
        for num in siguiente['secuencia'][:20]:
            y_seq[num % 100] = 1
        
        X.append(X_seq)
        y.append(y_seq.tolist())
    
    return np.array(X), np.array(y)

def crear_modelo(ventana=10, n_features=100):
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import LSTM, Dense, Dropout
    
    model = Sequential([
        LSTM(64, input_shape=(ventana, n_features), return_sequences=True),
        Dropout(0.2),
        LSTM(32),
        Dropout(0.2),
        Dense(32, activation='relu'),
        Dense(n_features, activation='softmax')
    ])
    
    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
    return model

def entrenar_modelo(X, y, epochs=30, batch_size=32):
    from tensorflow.keras.callbacks import EarlyStopping
    
    model = crear_modelo(ventana=X.shape[1], n_features=X.shape[2])
    
    early_stop = EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True)
    
    history = model.fit(
        X, y,
        epochs=epochs,
        batch_size=batch_size,
        validation_split=0.2,
        callbacks=[early_stop],
        verbose=1
    )
    
    return model, history

def exportar_modelo_json(model, historial, nombre_modelo="quiniela_lstm"):
    pesos = model.get_weights()
    
    pesos_serializables = []
    for p in pesos:
        pesos_serializables.append({
            'shape': list(p.shape),
            'dtype': str(p.dtype),
            'data': p.tolist() if len(p.shape) > 0 else float(p)
        })
    
    modelo_data = {
        'nombre': nombre_modelo,
        'fecha_entrenamiento': datetime.now().isoformat(),
        'arquitectura': {
            'ventana': 10,
            'n_features': 100,
            'capas': [
                {'tipo': 'LSTM', 'unidades': 64, 'return_sequences': True},
                {'tipo': 'Dropout', 'tasa': 0.2},
                {'tipo': 'LSTM', 'unidades': 32},
                {'tipo': 'Dropout', 'tasa': 0.2},
                {'tipo': 'Dense', 'unidades': 32, 'activation': 'relu'},
                {'tipo': 'Dense', 'unidades': 100, 'activation': 'softmax'}
            ]
        },
        'historial': historial.history if hasattr(historial, 'history') else historial,
        'pesos': pesos_serializables
    }
    
    with open(f"{nombre_modelo}_pesos.json", 'w') as f:
        json.dump(modelo_data, f)
    
    return modelo_data

def cargar_modelo_json(path):
    with open(path, 'r') as f:
        data = json.load(f)
    return data

def predecir_lstm(modelo_data, X_input):
    weights = modelo_data['pesos']
    weights_arrays = []
    for w in weights:
        weights_arrays.append(np.array(w['data']))
    
    temp_model = crear_modelo(ventana=10, n_features=100)
    temp_model.set_weights(weights_arrays)
    
    pred = temp_model.predict(X_input)
    top_indices = np.argsort(pred[0])[-10:][::-1]
    
    return top_indices.tolist()

if __name__ == "__main__":
    print("=" * 60)
    print("PIPELINE LSTM - ENTRENAMIENTO PARA PRODUCCIÓN")
    print("=" * 60)
    
    print("\n1. Obteniendo datos...")
    datos = obtener_datos(dias=100)
    
    print("\n2. Preparando secuencias...")
    secuencias = preparar_secuencias(datos)
    print(f"   Secuencias: {len(secuencias)}")
    
    print("\n3. Preparando datos LSTM...")
    X, y = preparar_datos_lstm(secuencias, ventana=10)
    print(f"   X shape: {X.shape}, y shape: {y.shape}")
    
    print("\n4. Entrenando modelo...")
    try:
        import tensorflow as tf
        modelo, history = entrenar_modelo(X, y, epochs=30)
        
        print("\n5. Exportando modelo...")
        modelo_data = exportar_modelo_json(modelo, history, "quiniela_lstm")
        print(f"   Modelo guardado: {modelo_data['nombre']}")
        print(f"   Fecha: {modelo_data['fecha_entrenamiento']}")
        
        print("\n6. Predicción de prueba...")
        X_test = X[-1:]
        prediccion = predecir_lstm(modelo_data, X_test)
        print(f"   Números predichos: {[f'{n:02d}' for n in prediccion]}")
        
    except ImportError:
        print(" TensorFlow no disponible")
        print("   Instalar: pip install tensorflow")
    
    print("\n" + "=" * 60)
    print("PIPELINE COMPLETO!")
    print("=" * 60)