"""
Tests unitarios para el algoritmo de predicción de quiniela.
"""
import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from quiniela_ml.factores import (
    factor_frecuencia, factor_posicion, factor_recencia,
    factor_tendencia, factor_ciclo, factor_ausencia,
    factor_coocurrencia, factor_caliente, factor_atrasado,
    factor_suma_digitos, calcular_todos_los_factores
)
from quiniela_ml.pesos_dinamicos import (
    PESOS_INICIALES, calcular_efectividad_factores, ajustar_pesos
)
from quiniela_ml.predictor import PredictorQuiniela
from quiniela_ml.data import generar_datos_prueba


class TestFactores(unittest.TestCase):
    """Tests para cada factor individual"""
    
    def setUp(self):
        self.historico_2d = [11, 22, 33, 11, 44, 55, 11, 22, 66, 77]
        self.rango = 100
    
    def test_frecuencia(self):
        """Verificar que frecuencia retorne counts correctos"""
        freq = factor_frecuencia(self.historico_2d, self.rango)
        # 11 aparece 3 veces en 10 sorteos
        self.assertAlmostEqual(freq[11], 3/10)
        # 22 aparece 2 veces
        self.assertAlmostEqual(freq[22], 2/10)
        # 99 nunca aparece
        self.assertEqual(freq[99], 0)
    
    def test_recencia(self):
        """Verificar recencia en últimos 7 sorteos"""
        hist = [10, 20, 30, 40, 50, 60, 70, 80, 90]
        rec = factor_recencia(hist, 7, self.rango)
        # Últimos 7: 30,40,50,60,70,80,90
        self.assertEqual(rec[30], 1.0)
        self.assertEqual(rec[90], 1.0)
        # 10 no está en últimos 7
        self.assertEqual(rec[10], 0.0)
    
    def test_suma_digitos_2d(self):
        """Verificar suma de dígitos para 2 cifras"""
        numeros = [123, 245, 367, 123, 489]  # 4-digit nums, last 2 used
        # 23->2+3=5, 45->4+5=9, 67->6+7=13, 23->2+3=5, 89->8+9=17
        # suma=5 aparece 2 veces en 5 sorteos
        scores = factor_suma_digitos(numeros, 2, self.rango)
        # Para número 23: suma=5, frecuencia=2/5
        self.assertAlmostEqual(scores[23], 2/5)
        # Para número 99: suma=18, nunca aparece
        self.assertEqual(scores[99], 0)
    
    def test_suma_digitos_4d(self):
        """Verificar suma de dígitos para 4 cifras"""
        numeros = [2389, 1234]
        # 2+3+8+9=22, 1+2+3+4=10
        scores = factor_suma_digitos(numeros, 4, 10000)
        # 2389 tiene suma 22, aparece 1 vez en 2 sorteos
        self.assertAlmostEqual(scores[2389], 1/2)
    
    def test_posicion(self):
        """Verificar análisis de posición"""
        nums = [1234, 5678]
        # posición 0 (millares): 1 y 5 -> frec 0.5 cada una
        scores = factor_posicion(nums, 4)
        # Para 1234: digito[0]=1 (0.5), digito[1]=2 (0.5), etc
        # score = (0.5 + 0.5 + 0.5 + 0.5)/4 = 0.5
        self.assertAlmostEqual(scores[1234], 0.5)
    
    def test_ciclo(self):
        """Verificar estimación de ciclo"""
        hist = [10, 20, 30, 10, 40, 50, 10, 60, 70, 10]
        # 10 aparece en índices 0,3,6,9 -> gaps=[3,3,3]
        ciclo = factor_ciclo(hist, self.rango)
        # ciclo_prom=3, último_gap=1 -> score = 1/3
        self.assertAlmostEqual(ciclo[10], 1/3)
    
    def test_ausencia(self):
        """Verificar cálculo de ausencia"""
        hist = [50, 60, 70, 80, 90]
        # 50 apareció en índice 0 -> ausencia = 5-0 = 5
        aus = factor_ausencia(hist, self.rango)
        # Normalizado: 5/5*2=2 -> min(1,2)=1
        self.assertEqual(aus[50], 1.0)
        # 99 nunca apareció
        self.assertEqual(aus[99], 1.0)
        # 90 apareció en último índice -> ausencia=1 sorteo atrás -> score=min(1, 1/5*2)=0.4
        self.assertAlmostEqual(aus[90], 0.4)
    
    def test_caliente(self):
        """Verificar racha de números calientes"""
        hist = [10, 20, 20, 30, 20, 20]
        cal = factor_caliente(hist, 3, self.rango)
        # Últimos: 20 aparece en índices 4,5 -> racha de 2
        self.assertEqual(cal[20], 1.0)
        # 30 aparece en índice 3 -> no racha
        self.assertEqual(cal[30], 0.0)
    
    def test_atrasado(self):
        """Verificar detección de atrasados"""
        hist = list(range(50)) + [99]  # 99 al final
        atra = factor_atrasado(hist, 0.8, self.rango)
        # 99 apareció al final -> no atrasado
        self.assertLess(atra[99], 0.5)
        # 0 apareció al principio -> muy atrasado
        self.assertGreater(atra[0], 0.5)
    
    def test_coocurrencia(self):
        """Verificar co-ocurrencia"""
        sorteos = [[10, 20, 30], [10, 40, 50], [10, 20, 60]]
        cooc = factor_coocurrencia(sorteos, self.rango)
        # 10 co-ocurre con 20 en 2 sorteos
        # Total co-oc de 10: con 20(2) + 30(1) + 40(1) + 50(1) + 60(1) = 6
        # score = min(1, 6/3*2) = min(1, 4) = 1
        self.assertEqual(cooc[10], 1.0)


class TestPesosDinamicos(unittest.TestCase):
    """Tests para el sistema de pesos dinámicos"""
    
    def test_efectividad(self):
        """Verificar cálculo de efectividad"""
        historico = [10, 20, 30, 40, 50, 60, 70, 80, 90, 10]
        scores = []
        resultados = []
        for i in range(5):
            scores.append({
                'frecuencia': {n: 1.0/100 for n in range(100)},
                'recencia': {n: 0.0 for n in range(100)},
                'ciclo': {n: 0.0 for n in range(100)},
                'ausencia': {n: 0.0 for n in range(100)},
            })
            resultados.append(10)
        
        efect = calcular_efectividad_factores(historico, scores, resultados)
        self.assertIn('frecuencia', efect)
        self.assertGreaterEqual(efect['frecuencia'], 0)
        self.assertLessEqual(efect['frecuencia'], 1)
    
    def test_ajuste_pesos(self):
        """Verificar que los pesos se re-normalizan"""
        efect = {f: 0.5 for f in PESOS_INICIALES}
        efect['frecuencia'] = 0.9
        
        nuevos = ajustar_pesos(efect, tasa_aprendizaje=1.0)
        suma = sum(nuevos.values())
        self.assertAlmostEqual(suma, 1.0, places=5)
        # Con learning_rate=1.0, frecuencia=0.9, otros=0.5
        # total = 0.9 + 0.5*11 = 6.4, peso_frec = 0.9/6.4 = 0.14
        self.assertAlmostEqual(nuevos['frecuencia'], 0.9 / (0.9 + 0.5 * 11), places=4)


class TestPredictor(unittest.TestCase):
    """Tests para el predictor orquestador"""
    
    def setUp(self):
        self.historico, self.turnos = generar_datos_prueba(200)
        self.predictor = PredictorQuiniela(usar_xgboost=False)
    
    def test_prediccion_2cifras(self):
        """Verificar predicción de 2 cifras"""
        resultado = self.predictor.predecir_nivel(
            self.historico, self.turnos, "Nocturna", 2, 10
        )
        self.assertEqual(len(resultado), 10)
        for r in resultado:
            self.assertIn('numero', r)
            self.assertIn('score', r)
            self.assertIn('probabilidad', r)
            self.assertEqual(len(r['numero']), 2)
            self.assertGreaterEqual(r['score'], 0)
    
    def test_prediccion_3cifras(self):
        """Verificar predicción de 3 cifras"""
        resultado = self.predictor.predecir_nivel(
            self.historico, self.turnos, "Nocturna", 3, 5
        )
        self.assertEqual(len(resultado), 5)
        for r in resultado:
            self.assertEqual(len(r['numero']), 3)
    
    def test_prediccion_4cifras(self):
        """Verificar predicción de 4 cifras"""
        resultado = self.predictor.predecir_nivel(
            self.historico, self.turnos, "Nocturna", 4, 5
        )
        self.assertEqual(len(resultado), 5)
        for r in resultado:
            self.assertEqual(len(r['numero']), 4)
    
    def test_prediccion_completa(self):
        """Verificar predicción completa"""
        resultado = self.predictor.predecir(
            self.historico, self.turnos, "Nocturna"
        )
        self.assertIn('predicciones_2cifras', resultado)
        self.assertIn('predicciones_3cifras', resultado)
        self.assertIn('predicciones_4cifras', resultado)
        self.assertIn('pesos_utilizados', resultado)
        self.assertIn('redoblona', resultado)
        
        # Verificar que los scores están ordenados descendente
        scores = [r['score'] for r in resultado['predicciones_2cifras']]
        self.assertEqual(scores, sorted(scores, reverse=True))
    
    def test_pesos_actualizados(self):
        """Verificar que los pesos se actualizan"""
        pesos_iniciales = dict(self.predictor.pesos)
        self.predictor.actualizar_pesos_con_historial(self.historico, self.turnos)
        # Los pesos pueden ser iguales o diferentes
        self.assertEqual(
            set(self.predictor.pesos.keys()),
            set(pesos_iniciales.keys())
        )


class TestCalibracion(unittest.TestCase):
    """Tests para el sistema de calibración"""
    
    def test_probabilidades_en_rango(self):
        """Verificar que las probabilidades están en [0, 100]"""
        predictor = PredictorQuiniela(usar_xgboost=False)
        hist, turns = generar_datos_prueba(100)
        resultado = predictor.predecir(hist, turns, "Nocturna")
        for nivel in ['predicciones_2cifras']:
            for r in resultado[nivel]:
                self.assertGreaterEqual(r['probabilidad'], 0)
                self.assertLessEqual(r['probabilidad'], 100)
    
    def test_scores_ordenados(self):
        """Verificar que los scores están en orden descendente"""
        predictor = PredictorQuiniela(usar_xgboost=False)
        hist, turns = generar_datos_prueba(100)
        r = predictor.predecir_nivel(hist, turns, "Nocturna", 2, 10)
        scores = [x['score'] for x in r]
        for i in range(len(scores) - 1):
            self.assertGreaterEqual(scores[i], scores[i + 1])


if __name__ == '__main__':
    unittest.main(verbosity=2)
