"""
Entry point para ejecutar predicción completa.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from quiniela_ml.predictor import PredictorQuiniela
from quiniela_ml.data import (
    cargar_desde_supabase, generar_datos_prueba, cargar_desde_csv
)
from quiniela_ml.modelo import exportar_modelo_json
import json


def ejecutar_prediccion(
    turno: str = "Nocturna",
    usar_xgboost: bool = True,
    fuente: str = "supabase",
    dias: int = 365,
    csv_path: str = "",
    exportar: bool = True
):
    """
    Ejecuta predicción completa y muestra resultados.
    
    Args:
        turno: turno a predecir
        usar_xgboost: si entrenar XGBoost
        fuente: "supabase", "csv", o "prueba"
        dias: días hacia atrás para datos
        exportar: si exportar a JSON
    """
    print("=" * 60)
    print("PREDICTOR QUINIELA - ALGORITMO COMPLETO")
    print("=" * 60)
    
    # Cargar datos
    print(f"\n1. Cargando datos ({fuente})...")
    if fuente == "supabase":
        historico, turnos = cargar_desde_supabase(dias=dias, turno=turno)
    elif fuente == "csv" and csv_path:
        historico, turnos = cargar_desde_csv(csv_path)
    else:
        historico, turnos = generar_datos_prueba(200)
    
    if not historico:
        print("ERROR: No hay datos para procesar")
        return
    
    # Inicializar predictor
    print("\n2. Inicializando predictor...")
    predictor = PredictorQuiniela(usar_xgboost=usar_xgboost)
    print(f"   Pesos iniciales: {len(predictor.pesos)} factores")
    
    # Ejecutar predicción
    print(f"\n3. Prediciendo para {turno}...")
    resultado = predictor.predecir(historico, turnos, turno)
    
    # Mostrar resultados
    print(f"\n4. RESULTADOS:")
    print(f"   Turno: {resultado['turno']}")
    print(f"   XGBoost activo: {resultado['xgboost_activo']}")
    print(f"   Redoblona: {resultado.get('redoblona', 'N/A')}")
    
    print(f"\n   --- 2 CIFRAS (Top 10) ---")
    for i, r in enumerate(resultado['predicciones_2cifras'], 1):
        print(f"   {i}. {r['numero']} - score: {r['score']:.1f} - prob: {r['probabilidad']:.1f}% - [{', '.join(r['factores'][:3])}]")
    
    print(f"\n   --- 3 CIFRAS (Top 5) ---")
    for i, r in enumerate(resultado['predicciones_3cifras'], 1):
        print(f"   {i}. {r['numero']} - score: {r['score']:.1f} - prob: {r['probabilidad']:.1f}%")
    
    print(f"\n   --- 4 CIFRAS (Top 5) ---")
    for i, r in enumerate(resultado['predicciones_4cifras'], 1):
        print(f"   {i}. {r['numero']} - score: {r['score']:.1f} - prob: {r['probabilidad']:.1f}%")
    
    # Mostrar pesos
    print(f"\n   --- PESOS DINÁMICOS ---")
    for factor, peso in sorted(resultado['pesos_utilizados'].items(), key=lambda x: x[1], reverse=True):
        print(f"   {factor}: {peso:.2%}")
    
    # Exportar a JSON completo para la app TypeScript
    if exportar:
        scores_2d = {r['numero']: r['score'] for r in resultado['predicciones_2cifras']}
        exportar_modelo_json(
            f"quiniela_completo_{turno.lower()}",
            scores_2d,
            metadata={"turno": turno, "factores": list(predictor.pesos.keys())}
        )
        
        # Exportar predicción completa en formato que la app entiende
        export_completo = {
            "modelo": f"quiniela_completo_{turno.lower()}",
            "fecha_exportacion": __import__('datetime').datetime.now().isoformat(),
            "turno": turno,
            "xgboost_activo": resultado['xgboost_activo'],
            "pesos": resultado['pesos_utilizados'],
            "redoblona": resultado.get('redoblona', ''),
            "predicciones_2cifras": [
                {"numero": r['numero'], "score": r['score'], "probabilidad": r['probabilidad'], "factores": r['factores']}
                for r in resultado['predicciones_2cifras']
            ],
            "predicciones_3cifras": [
                {"numero": r['numero'], "score": r['score'], "probabilidad": r['probabilidad']}
                for r in resultado['predicciones_3cifras']
            ],
            "predicciones_4cifras": [
                {"numero": r['numero'], "score": r['score'], "probabilidad": r['probabilidad']}
                for r in resultado['predicciones_4cifras']
            ],
            "scores_por_numero": scores_2d,
            "top_10_2d": [{"numero": n, "score": s} for n, s in sorted(scores_2d.items(), key=lambda x: x[1], reverse=True)[:10]],
            "metadata": {
                "turno": turno,
                "factores": list(predictor.pesos.keys()),
                "sorteos_analizados": len(historico),
            }
        }
        export_path = os.path.join("modelos_exportados", f"quiniela_completo_{turno.lower()}_prediccion.json")
        with open(export_path, "w") as f:
            json.dump(export_completo, f, indent=2)
        print(f"Exportado completo: {export_path}")
    
    # Exportar tambien scores separados de XGBoost y Random Forest (para ml_api)
    if resultado.get('xgboost_activo'):
        try:
            from .modelo import exportar_modelo_json
            exportar_modelo_json(
                f"xgboost_{turno.lower()}",
                scores_2d,
                metadata={"turno": turno, "modelo": "xgboost"}
            )
            # exportar RF tambien (mismos scores, es el ensemble completo)
            exportar_modelo_json(
                f"random_forest_{turno.lower()}",
                scores_2d,
                metadata={"turno": turno, "modelo": "random_forest"}
            )
        except Exception as e:
            print(f"  Error exportando modelos auxiliares: {e}")
    
    # Guardar resultado resumido
    resumen = {
        "fecha": __import__('datetime').datetime.now().isoformat(),
        "turno": turno,
        "xgboost_activo": resultado['xgboost_activo'],
        "pesos": resultado['pesos_utilizados'],
        "predicciones": {
            "2_cifras": [{"numero": r['numero'], "probabilidad": r['probabilidad']} for r in resultado['predicciones_2cifras']],
            "3_cifras": [{"numero": r['numero'], "probabilidad": r['probabilidad']} for r in resultado['predicciones_3cifras']],
            "4_cifras": [{"numero": r['numero'], "probabilidad": r['probabilidad']} for r in resultado['predicciones_4cifras']],
        },
        "redoblona": resultado.get('redoblona'),
    }
    os.makedirs("resultados", exist_ok=True)
    path = os.path.join("resultados", f"prediccion_{turno.lower()}.json")
    with open(path, "w") as f:
        json.dump(resumen, f, indent=2)
    print(f"Resultado guardado: {path}")
    
    return resultado


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Predictor de Quiniela")
    parser.add_argument("--turno", default="Nocturna", choices=["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"])
    parser.add_argument("--fuente", default="supabase", choices=["supabase", "csv", "prueba"])
    parser.add_argument("--dias", type=int, default=365)
    parser.add_argument("--csv", default="")
    parser.add_argument("--no-xgboost", action="store_true")
    parser.add_argument("--test", action="store_true", help="Ejecutar tests")
    
    args = parser.parse_args()
    
    if args.test:
        print("Ejecutando tests...")
        import unittest
        from quiniela_ml import tests
        unittest.main(module=tests, verbosity=2, exit=False)
    else:
        ejecutar_prediccion(
            turno=args.turno,
            usar_xgboost=not args.no_xgboost,
            fuente=args.fuente,
            dias=args.dias,
            csv_path=args.csv,
        )
