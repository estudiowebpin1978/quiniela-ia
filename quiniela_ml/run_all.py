"""
Ejecuta predicción para los 5 turnos y exporta JSON para la app.
"""
import sys, os, importlib
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from quiniela_ml.run import ejecutar_prediccion

# Verificar disponibilidad de XGBoost
try:
    import xgboost
    XGB_OK = True
    print(f"XGBoost {xgboost.__version__} disponible")
except ImportError:
    XGB_OK = False
    print("XGBoost NO disponible - se usaran solo factores estadisticos")

try:
    import sklearn
    print(f"scikit-learn {sklearn.__version__} disponible")
except ImportError:
    print("scikit-learn NO disponible")

TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

for turno in TURNOS:
    try:
        resultado = ejecutar_prediccion(turno=turno, usar_xgboost=XGB_OK, fuente="supabase", dias=365)
        if resultado:
            print(f"OK {turno} - XGBoost activo: {resultado.get('xgboost_activo', False)} - {len(resultado.get('predicciones_2cifras', []))} preds")
        else:
            print(f"OK {turno} - sin resultado")
    except Exception as e:
        print(f"FAIL {turno} fallo: {e}")
        import traceback
        traceback.print_exc()
