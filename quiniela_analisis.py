import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from collections import Counter
import warnings
warnings.filterwarnings('ignore')

# ============================================
# CONFIGURACIÓN
# ============================================
SUPABASE_URL = "https://wazkylxgqckjfkcmfotl.supabase.co"
SUPABASE_KEY = __import__("os").environ.get("SUPABASE_SERVICE_KEY", "")

# Sueños significados
SUENOS = {
    0: "Huevos", 1: "Agua", 2: "Niño", 3: "San Cono", 4: "La cama",
    5: "Gato", 6: "Perro", 7: "Revolver", 8: "Incendio", 9: "Arroyo",
    10: "La leche", 11: "Minero", 12: "Soldado", 13: "La yeta", 14: "Borracho",
    15: "Niña bonita", 16: "Anillo", 17: "Desgracia", 18: "Sangre", 19: "Pescado",
    20: "La fiesta", 21: "Mujer", 22: "Loco", 23: "Cocinero", 24: "Caballo",
    25: "Gallina", 26: "La misa", 27: "Peine", 28: "Cerro", 29: "San Pedro",
    30: "Santa Rosa", 31: "Luz", 32: "Dinero", 33: "Cristo", 34: "Cabeza",
    35: "Pajarito", 36: "Manteca", 37: "Dentista", 38: "Piedras", 39: "Lluvia",
    40: "Cura", 41: "Cuchillo", 42: "Zapatillas", 43: "Balcón", 44: "Cárcel",
    45: "Vino", 46: "Tomates", 47: "Muerto", 48: "Muerto habla", 49: "Carne",
    50: "Pan", 51: "Serrucho", 52: "Madre", 53: "Barco", 54: "Vaca",
    55: "Música", 56: "Caída", 57: "Jorobado", 58: "Ahogado", 59: "Plantas",
    60: "Virgen", 61: "Escopeta", 62: "Inundación", 63: "Casamiento", 64: "Llanto",
    65: "Cazador", 66: "Lombrices", 67: "Víbora", 68: "Sobrinos", 69: "Vicios",
    70: "Muerto sueño", 71: "Excremento", 72: "Sorpresa", 73: "Hospital", 74: "Gente negra",
    75: "Besos", 76: "Fuego", 77: "Pierna mujer", 78: "Ramera", 79: "Ladrón",
    80: "Bochas", 81: "Flores", 82: "Pelea", 83: "Mal tiempo", 84: "Iglesia",
    85: "Linterna", 86: "Humo", 87: "Piojos", 88: "Papas", 89: "Rata",
    90: "Miedo", 91: "Excursión", 92: "Médico", 93: "Enamorado", 94: "Cementerio",
    95: "Anteojos", 96: "Marido", 97: "Mesa", 98: "Lavandera", 99: "Hermano"
}

# ============================================
# OBTENER DATOS
# ============================================
def obtener_datos(dias=365, turno=None, fetch_all=False):
    """Obtiene datos de Supabase"""
    desde = (datetime.now() - timedelta(days=dias)).strftime('%Y-%m-%d')

    url = f"{SUPABASE_URL}/rest/v1/quiniela_nacional"
    params = {
        'select': 'fecha,turno,resultados',
        'order': 'fecha.desc,turno'
    }
    if not fetch_all:
        params['fecha'] = f'gte.{desde}'
        params['limit'] = 5000
    else:
        # If fetching all, attempt to retrieve a very high number of records
        params['limit'] = 1000000

    if turno:
        params['turno'] = f'eq.{turno}'

    response = requests.get(url, params=params, headers={
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}'
    })

    # Ensure the response was successful before trying to parse JSON
    response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)

    datos = response.json()

    # Ensure 'datos' is always a list for iteration.
    # If the API returns a single dictionary, wrap it in a list.
    if isinstance(datos, dict):
        datos = [datos]
    elif not isinstance(datos, list):
        # If it's neither a list nor a dict, it's an unexpected format (e.g., a plain string error).
        print(f"Warning: Unexpected data type received from API: {type(datos)}. Data: {datos}")
        return [] # Return empty list to prevent further processing issues

    registros = []
    for row in datos:
        # Check if 'row' is a dictionary before using .get()
        if isinstance(row, dict) and row.get('resultados'):
            nums = [r['numero'] for r in row['resultados'] if 'numero' in r]
            if len(nums) >= 20:
                registros.append({
                    'fecha': row['fecha'],
                    'turno': row['turno'],
                    'numeros': nums
                })

    return registros

def preparar_secuencias(datos):
    """Convierte datos en secuencias de 2 dígitos"""
    secuencias = []
    for reg in datos:
        nums = [int(n) % 100 for n in reg['numeros'][:20]]
        secuencias.append({
            'fecha': reg['fecha'],
            'turno': reg['turno'],
            'secuencia': nums
        })
    return secuencias

# ============================================
# ANÁLISIS ESTADÍSTICO
# ============================================
def analisis_frecuencias(secuencias):
    """Análisis de frecuencias"""
    todos = []
    for s in secuencias:
        todos.extend(s['secuencia'])

    freq = Counter(todos)
    total = len(todos)

    resultados = []
    for num in range(100):
        count = freq.get(num, 0)
        resultados.append({
            'numero': num,
            'frecuencia': count,
            'porcentaje': round(count / total * 100, 2),
            'significado': SUENOS.get(num, '')
        })

    return sorted(resultados, key=lambda x: x['frecuencia'], reverse=True)

def analisis_retrasos(secuencias):
    """Análisis de retrasos (cuántos sorteos sin salir)"""
    todos_nums = []
    for s in reversed(secuencias):
        todos_nums.extend(s['secuencia'])

    freq = Counter(todos_nums)
    ultimos = set(todos_nums[:100])  # Últimos 5 sorteos

    resultados = []
    for num in range(100):
        if num in ultimos:
            retraso = 0
        else:
            # Contar desde el final
            retraso = 1
            for n in reversed(todos_nums[100:]):
                if n == num:
                    break
                retraso += 1

        resultados.append({
            'numero': num,
            'retraso': retraso,
            'frecuencia': freq.get(num, 0),
            'significado': SUENOS.get(num, '')
        })

    return sorted(resultados, key=lambda x: x['retraso'], reverse=True)

def analisis_secuenciales(secuencias):
    """Análisis de qué números siguen a otros"""
    transiciones = {}

    for s in secuencias:
        seq = s['secuencia']
        for i in range(len(seq) - 1):
            actual = seq[i]
            siguiente = seq[i + 1]
            if actual not in transiciones:
                transiciones[actual] = []
            transiciones[actual].append(siguiente)

    # Contar transiciones más comunes
    resultados = {}
    for num, sigs in transiciones.items():
        contador = Counter(sigs)
        resultados[num] = dict(contador.most_common(10))

    return resultados

def analisis_pares(secuencias):
    """Análisis de números que salen juntos"""
    todos = []
    for s in secuencias:
        nums = s['secuencia']
        for i in range(len(nums)):
            for j in range(i + 1, len(nums)):
                par = tuple(sorted([nums[i], nums[j]]))
                todos.append(par)

    freq = Counter(todos)
    return freq.most_common(20)

# ============================================
# ANÁLISIS CON SCIKIT-LEARN
# ============================================
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

def crear_features(secuencias, ventana=10):
    """Crea features para ML"""
    X = []
    y = []

    for i in range(len(secuencias) - ventana):
        # Features: últimos 'ventana' números
        features = []
        for j in range(ventana):
            features.extend([
                secuencias[i + j]['secuencia'][k] if k < len(secuencias[i + j]['secuencia']) else 0
                for k in range(20)
            ])

        # Frecuencias de los últimos 10 sorteos
        for num in range(100):
            count = 0
            for s in secuencias[i:i+ventana]:
                if num in s['secuencia']:
                    count += 1
            features.append(count)

        X.append(features)

        # Target: números del siguiente sorteo
        siguiente = secuencias[i + ventana]['secuencia'][:10]
        y.append(siguiente)

    return np.array(X), np.array(y)

def entrenar_modelo(X, y):
    """Entrena modelo Random Forest"""
    # Dividir datos
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # Escalar
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Entrenar
    modelo = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42, n_jobs=-1)
    modelo.fit(X_train_scaled, y_train)

    # Evaluar con exact match accuracy
    y_train_pred = modelo.predict(X_train_scaled)
    y_test_pred = modelo.predict(X_test_scaled)

    train_score = np.mean([np.array_equal(y_true_sample, y_pred_sample) for y_true_sample, y_pred_sample in zip(y_train, y_train_pred)])
    test_score = np.mean([np.array_equal(y_true_sample, y_pred_sample) for y_true_sample, y_pred_sample in zip(y_test, y_test_pred)])

    print(f"Train exact match accuracy: {train_score:.2%}")
    print(f"Test exact match accuracy: {test_score:.2%}")

    return modelo, scaler

def predecir_proximo(modelo, scaler, secuencias_recientes):
    """Predice próximos números"""
    features = []
    for s in secuencias_recientes[-10:]:
        features.extend(s['secuencia'][:20])

    # Contador de frecuencias
    for num in range(100):
        count = sum(1 for s in secuencias_recientes[-10:] if num in s['secuencia'])
        features.append(count)

    X = np.array([features])
    X_scaled = scaler.transform(X)

    predicho = modelo.predict(X_scaled)
    return predicho[0]

# ============================================
# ANÁLISIS CON TENSORFLOW/LSTM
# ============================================
try:
    import tensorflow as tf
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import LSTM, Dense, Dropout
    from tensorflow.keras.callbacks import EarlyStopping

    def crear_modelo_lstm(ventana=10, n_features=100): # Changed n_features from 20 to 100
        """Crea modelo LSTM"""
        model = Sequential([
            LSTM(64, input_shape=(ventana, n_features), return_sequences=True),
            Dropout(0.2),
            LSTM(32),
            Dropout(0.2),
            Dense(32, activation='relu'),
            Dense(n_features, activation='softmax') # Changed output dimension from 20 to n_features (100)
        ])

        model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
        return model

    def preparar_datos_lstm(secuencias, ventana=10):
        """Prepara datos para LSTM"""
        X = []
        y = []

        for i in range(len(secuencias) - ventana):
            seq = secuencias[i:i + ventana]

            # One-hot encoding de los números
            X_seq = np.zeros((ventana, 100))
            for j, s in enumerate(seq):
                for k, num in enumerate(s['secuencia'][:20]):
                    X_seq[j, num] = 1

            X.append(X_seq)

            # Target: siguiente secuencia
            y_seq = np.zeros(100)
            for num in secuencias[i + ventana]['secuencia'][:20]:
                y_seq[num] = 1
            y.append(y_seq)

        return np.array(X), np.array(y)

    def entrenar_lstm(X, y):
        """Entrena modelo LSTM"""
        model = crear_modelo_lstm(n_features=X.shape[2]) # Pass actual n_features

        early_stop = EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True)

        history = model.fit(
            X, y,
            epochs=50,
            batch_size=32,
            validation_split=0.2,
            callbacks=[early_stop],
            verbose=1
        )

        return model, history

    LSTM_DISPONIBLE = True
except ImportError:
    print("TensorFlow no disponible. Usando scikit-learn.")
    LSTM_DISPONIBLE = False

# ============================================
# MAIN - EJECUTAR ANÁLISIS
# ============================================
if __name__ == "__main__":
    print("=" * 60)
    print("QUINIELA NACIONAL - ANÁLISIS AVANZADO")
    print("=" * 60)

    # Obtener datos
    print("\n1. Obteniendo datos...")
    datos = obtener_datos(dias=100)  # Últimos 100 días
    secuencias = preparar_secuencias(datos)
    print(f"   Total registros: {len(secuencias)}")

    # Análisis de frecuencias
    print("\n2. Análisis de frecuencias...")
    freq_top = analisis_frecuencias(secuencias)[:15]
    print("   Top 15 números más frecuentes:")
    for f in freq_top:
        print(f"   {f['numero']:02d} ({f['significado']}): {f['frecuencia']} veces ({f['porcentaje']}%) ")

    # Análisis de retrasos
    print("\n3. Análisis de retrasos...")
    retrasados = analisis_retrasos(secuencias)[:10]
    print("   Números con más retraso:")
    for r in retrasados:
        print(f"   {r['numero']:02d} ({r['significado']}): {r['retraso']} sorteos sin salir")

    # Análisis de pares
    print("\n4. Análisis de pares (números que salen juntos)...")
    pares = analisis_pares(secuencias)[:10]
    print("   Top 10 pares:")
    for par, count in pares:
        print(f"   {par[0]:02d}-{par[1]:02d}: {count} veces")

    # ML con scikit-learn
    print("\n5. Entrenando modelo Random Forest...")
    X, y = crear_features(secuencias)
    print(f"   Datos: {X.shape[0]} muestras, {X.shape[1]} features")
    modelo, scaler = entrenar_modelo(X, y)

    # Predicción de ejemplo
    print("\n6. Predicción de ejemplo...")
    pred = predecir_proximo(modelo, scaler, secuencias[-10:])
    print(f"   Números predichos: {[f'{n:02d}' for n in pred[:10]]}")

    if LSTM_DISPONIBLE:
        print("\n7. Entrenando modelo LSTM...")
        X_lstm, y_lstm = preparar_datos_lstm(secuencias)
        print(f"   Datos LSTM: {X_lstm.shape}")
        modelo_lstm, history = entrenar_lstm(X_lstm, y_lstm)
        print("   Modelo LSTM entrenado!")

    print("\n" + "=" * 60)
    print("ANÁLISIS COMPLETO!")
    print("=" * 60)

# ============================================
# ANÁLISIS AVANZADO v3 - NUEVAS FUNCIONES
# ============================================

def matriz_transicion_posicion(secuencias):
    """Matriz de transición por posición (pos 1->pos 2, etc)"""
    matrices = {}
    for pos in range(19):  # 20 posiciones, 19 transiciones
        transiciones = {}
        for s in secuencias:
            seq = s['secuencia']
            if pos < len(seq) - 1:
                actual = seq[pos]
                sig = seq[pos + 1]
                key = (actual, sig)
                transiciones[key] = transiciones.get(key, 0) + 1
        matrices[pos] = transiciones
    return matrices

def analisis_dia_semana(datos_raw):
    """Análisis por día de la semana"""
    dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
    freq_dia = {d: Counter() for d in dias}

    for reg in datos_raw:
        try:
            fecha = reg['fecha']
            dia = datetime.strptime(fecha, '%Y-%m-%d').weekday()
            nombre_dia = dias[dia]
            for n in reg['numeros'][:20]:
                freq_dia[nombre_dia][int(n) % 100] += 1
        except:
            continue

    # Encontrar números más frecuentes por día
    resultado = {}
    for dia in dias:
        if freq_dia[dia]:
            top = freq_dia[dia].most_common(10)
            resultado[dia] = [(n, c, SUENOS.get(n, '')) for n, c in top]
    return resultado

def analisis_pares_posicion(secuencias):
    """Análisis de qué números salen en posiciones específicas"""
    pos_stats = {p: Counter() for p in range(20)}

    for s in secuencias:
        seq = s['secuencia']
        for pos, num in enumerate(seq[:20]):
            pos_stats[pos][num] += 1

    # Top 5 por posición
    resultado = {}
    for pos in range(20):
        top = pos_stats[pos].most_common(5)
        resultado[f"Pos_{pos+1}"] = [(n, c) for n, c in top]
    return resultado

def analisis_numeros_frios_calientes(secuencias, umbral=0.5):
    """Identifica números fríos (casi no salen) y calientes (frecuentemente)"""
    todos = []
    for s in secuencias:
        todos.extend(s['secuencia'])

    freq = Counter(todos)
    total = len(todos)
    promedio = total / 100

    frios = []
    calientes = []
    normales = []

    for num in range(100):
        count = freq.get(num, 0)
        ratio = count / promedio
        info = {'numero': num, 'frecuencia': count, 'ratio': ratio, 'significado': SUENOS.get(num, '')}

        if ratio < umbral:
            frios.append(info)
        elif ratio > (1 / umbral):
            calientes.append(info)
        else:
            normales.append(info)

    return {
        'calientes': sorted(calientes, key=lambda x: x['ratio'], reverse=True)[:15],
        'frios': sorted(frios, key=lambda x: x['ratio'])[:15],
        'normales': sorted(normales, key=lambda x: x['frecuencia'], reverse=True)[:15]
    }

def analisis_ciclos(secuencias):
    """Análisis de ciclos (cuándo vuelve a salir un número)"""
    ciclos = []

    for s in secuencias:
        seq = s['secuencia']
        for num in range(100):
            posiciones = [i for i, n in enumerate(seq) if n == num]
            if len(posiciones) > 1:
                diffs = [posiciones[i+1] - posiciones[i] for i in range(len(posiciones)-1)]
                if diffs:
                    ciclos.append({
                        'numero': num,
                        'significado': SUENOS.get(num, ''),
                        'veces': len(posiciones),
                        'ciclo_promedio': np.mean(diffs),
                        'ciclo_min': min(diffs),
                        'ciclo_max': max(diffs)
                    })

    return sorted(ciclos, key=lambda x: x['ciclo_promedio'])[:20]

def analisis_chi_cuadrado(secuencias):
    """Test chi-cuadrado para verificar si la distribución es aleatoria"""
    try:
        from scipy import stats

        todos = []
        for s in secuencias:
            todos.extend(s['secuencia'])

        freq = Counter(todos)
        observed = np.array([freq.get(i, 0) for i in range(100)])
        expected = np.ones(100) * np.mean(observed)

        chi2, p_value = stats.chisquare(observed, expected)

        return {
            'chi2': chi2,
            'p_value': p_value,
            'is_random': p_value > 0.05,
            'interpretation': 'La distribución es estadísticamente aleatoria' if p_value > 0.05 else 'La distribución NO es aleatoria (hay sesgo)'
        }
    except ImportError:
        return {'error': 'scipy no disponible'}

def analisis_correlacion(secuencias):
    """Análisis de correlación entre números"""
    try:
        import pandas as pd

        # Crear DataFrame de frecuencias por sorteo
        df = pd.DataFrame()
        for i in range(len(secuencias)): # Iterate through all sequences
            s = secuencias[i]
            freq = Counter(s['secuencia'][:20])
            for num in range(100):
                df.loc[i, f'n_{num:02d}'] = freq.get(num, 0)

        # Correlación
        corr = df.corr()

        # Encontrar correlaciones más fuertes
        correlaciones_fuertes = []
        for i in range(100):
            for j in range(i+1, 100):
                c = corr.iloc[i, j]
                if abs(c) > 0.3:  # Umbral
                    correlaciones_fuertes.append({
                        'n1': i, 'n2': j,
                        's1': SUENOS.get(i, ''), 's2': SUENOS.get(j, ''),
                        'correlacion': round(c, 3)
                    })

        return sorted(correlaciones_fuertes, key=lambda x: abs(x['correlacion']), reverse=True)[:20]
    except ImportError:
        return [{'error': 'pandas no disponible'}]

def prediccion_ensemble(secuencias, num_predicciones=10):
    """Predicción usando ensemble de múltiples métodos"""
    predictions = {}

    # 1. Por frecuencia
    todos = []
    for s in secuencias:
        todos.extend(s['secuencia'])
    freq = Counter(todos)
    for n, c in freq.most_common(num_predicciones):
        predictions[n] = predictions.get(n, 0) + c

    # 2. Por números calientes
    caliente = analisis_numeros_frios_calientes(secuencias)
    for item in caliente['calientes'][:10]:
        n = item['numero']
        predictions[n] = predictions.get(n, 0) + item['ratio'] * 10

    # 3. Por ciclos (números listos para salir)
    ciclos = analisis_ciclos(secuencias)
    for item in ciclos[:10]:
        n = item['numero']
        if item['ciclo_promedio'] < 15:  # Ciclo corto
            predictions[n] = predictions.get(n, 0) + (15 - item['ciclo_promedio'])

    # 4. Por posición (números que suelen salir primero)
    pos_analysis = analisis_pares_posicion(secuencias)
    for key, items in pos_analysis.items():
        if 'Pos_1' in key:
            for n, c in items[:5]:
                predictions[n] = predictions.get(n, 0) + c * 2

    # Ordenar y devolver top
    resultado = []
    for n, score in sorted(predictions.items(), key=lambda x: x[1], reverse=True)[:20]:
        resultado.append({
            'numero': n,
            'numero_str': f'{n:02d}',
            'score': round(score, 2),
            'significado': SUENOS.get(n, '')
        })

    return resultado

def ejecutar_analisis_avanzado(dias=365, fetch_all=False, turno=None):
    """Ejecuta análisis avanzado completo"""
    print("\n" + "🔬" * 30)
    print(f"ANÁLISIS AVANZADO v3 - QUINIELA NACIONAL ({turno.upper() if turno else 'TODOS LOS TURNOS'})")
    print("🔬" * 30)

    # Obtener datos
    print("\n📡 Obteniendo datos...")
    datos = obtener_datos(dias=dias, fetch_all=fetch_all, turno=turno)
    secuencias = preparar_secuencias(datos)
    print(f"   {len(secuencias)} sorteosanalizados")

    if not secuencias:
        print("No hay datos para analizar para este turno.")
        return None # Return None if no data for analysis

    # 1. Matrices de transición por posición
    print("\n1️⃣ Matrices de transición por posición...")
    matrices_pos = matriz_transicion_posicion(secuencias)
    print("   ✓ Matrices calculadas")

    # 2. Análisis por día de semana
    print("\n2️⃣ Análisis por día de semana...")
    dias = analisis_dia_semana(datos)
    for dia, nums in dias.items():
        print(f"   {dia}: {', '.join([f'{n[0]:02d}' for n in nums[:5]])}")

    # 3. Números fríos y calientes
    print("\n3️⃣ Números fríos y calientes...")
    frio_calor = analisis_numeros_frios_calientes(secuencias)
    print(f"   🔥 Calientes: {', '.join([f'{n['numero']:02d}' for n in frio_calor['calientes'][:10]])}")
    print(f"   ❄️ Fríos: {', '.join([f'{n['numero']:02d}' for n in frio_calor['frios'][:10]])}")

    # 4. Análisis de ciclos
    print("\n4️⃣ Análisis de ciclos...")
    ciclos = analisis_ciclos(secuencias)
    print("   Top números por ciclo corto:")
    for c in ciclos[:5]:
        print(f"      {c['numero']:02d} ({c['significado']}) - ciclo: {c['ciclo_promedio']:.1f}")

    # 5. Chi-cuadrado
    print("\n5️⃣ Test Chi-cuadrado...")
    chi = analisis_chi_cuadrado(secuencias)
    if 'error' not in chi:
        print(f"   Chi²: {chi['chi2']:.2f}, p-value: {chi['p_value']:.4f}")
        print(f"   📊 {chi['interpretation']}")

    # 6. Correlaciones
    print("\n6️⃣ Correlaciones entre números...")
    corrs = analisis_correlacion(secuencias)
    if corrs and 'error' not in corrs[0]:
        print("   Correlaciones más fuertes:")
        for c in corrs[:5]:
            print(f"      {c['n1']:02d}-{c['n2']:02d}: {c['correlacion']:.3f}")

    # 7. Predicción Ensemble
    print("\n7️⃣ Predicción Ensemble (múltiples métodos)...")
    pred = prediccion_ensemble(secuencias)
    print("   Top 10 predicciones:")
    for i, p in enumerate(pred[:10], 1):
        print(f"      {i}. {p['numero_str']} ({p['significado']}) - score: {p['score']}")

    return {
        'matrices_posicion': matrices_pos,
        'dias': dias,
        'frio_calor': frio_calor,
        'ciclos': ciclos,
        'chi_cuadrado': chi,
        'correlaciones': corrs,
        'prediccion_ensemble': pred
    }

# ============================================
# EJECUTAR ANÁLISIS AVANZADO
# ============================================
if __name__ == "__main__":
    # This block is for demonstrating the functions when the script is run directly.
    # The user is now providing their own execution block.
    # Original call: resultados = ejecutar_analisis_avanzado()
    pass