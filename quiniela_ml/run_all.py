"""
Ejecuta predicción para los 5 turnos y exporta JSON para la app.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from quiniela_ml.run import ejecutar_prediccion

TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

for turno in TURNOS:
    try:
        ejecutar_prediccion(turno=turno, usar_xgboost=True, fuente="supabase", dias=365)
        print(f"\nOK {turno} completado\n")
    except Exception as e:
        print(f"\nFAIL {turno} fallo: {e}\n")
