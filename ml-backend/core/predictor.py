"""
Predictor principal: orquesta factores estadísticos + XGBoost.
Genera predicciones para 2, 3 y 4 cifras.
"""
import numpy as np
from collections import defaultdict
from typing import Optional

from .factores import calcular_todos_los_factores
from .pesos import PESOS_INICIALES, ajustar_pesos, calcular_efectividad_factores

try:
    from .ml_model import crear_features_ml, entrenar_xgboost, predecir_probabilidades
    XGB_DISPONIBLE = True
except ImportError:
    XGB_DISPONIBLE = False


class PredictorQuiniela:
    def __init__(self, usar_xgboost: bool = True, calibrar: bool = True):
        self.pesos = dict(PESOS_INICIALES)
        self.usar_xgboost = usar_xgboost and XGB_DISPONIBLE
        self.calibrar = calibrar
        self.xgb_model = None
        self.xgb_calibrated = None
        self._entrenado = False

    def _extraer_por_digitos(self, historico_completo, digitos):
        resultado = []
        for sorteo in historico_completo:
            for n in sorteo:
                if digitos == 2:
                    resultado.append(n % 100)
                elif digitos == 3:
                    resultado.append(n % 1000)
                else:
                    resultado.append(n)
        return resultado

    def _extraer_sorteos_por_digitos(self, historico_completo, digitos):
        resultado = []
        for sorteo in historico_completo:
            if digitos == 2:
                resultado.append([n % 100 for n in sorteo])
            elif digitos == 3:
                resultado.append([n % 1000 for n in sorteo])
            else:
                resultado.append(list(sorteo))
        return resultado

    def _preparar_por_turno(self, historico_completo, turnos, digitos):
        por_turno = defaultdict(list)
        for sorteo, turno in zip(historico_completo, turnos):
            for n in sorteo:
                if digitos == 2:
                    por_turno[turno].append(n % 100)
                elif digitos == 3:
                    por_turno[turno].append(n % 1000)
                else:
                    por_turno[turno].append(n)
        return dict(por_turno)

    def actualizar_pesos_con_historial(self, historico_completo, turnos, ventana=30):
        if len(historico_completo) < ventana + 10:
            return

        ventana_eval = historico_completo[-ventana:]
        resultados_reales = []
        factores_historicos = []

        for i in range(len(ventana_eval)):
            idx = len(historico_completo) - ventana + i
            hist_hasta = historico_completo[:idx]
            hist_flat_4 = [n for s in hist_hasta for n in s]
            hist_2d = [n % 100 for n in hist_flat_4]
            sorteo_actual = ventana_eval[i]
            real = sorteo_actual[0] % 100

            from .factores import factor_frecuencia, factor_recencia, factor_ciclo, factor_ausencia
            factores = {}
            rango = 100
            factores['frecuencia'] = factor_frecuencia(hist_2d, rango)
            factores['recencia'] = factor_recencia(hist_2d, 7, rango)
            factores['ciclo'] = factor_ciclo(hist_2d, rango)
            factores['ausencia'] = factor_ausencia(hist_2d, rango)

            factores_historicos.append(factores)
            resultados_reales.append(real)

        if len(factores_historicos) >= 5:
            efectividad = calcular_efectividad_factores(
                hist_2d, factores_historicos, resultados_reales
            )
            self.pesos = ajustar_pesos(efectividad, self.pesos)

    def entrenar_xgboost(self, secuencias_2d):
        if not self.usar_xgboost:
            return
        from .ml_model import crear_features_ml, entrenar_xgboost
        X, y = crear_features_ml(secuencias_2d)
        if len(X) < 50:
            return
        self.xgb_model, self.xgb_calibrated = entrenar_xgboost(X, y, calibrar=self.calibrar)
        self._entrenado = True

    def predecir_nivel(self, historico_completo, turnos, turno_actual, digitos, top_n=10):
        rango = 10 ** digitos
        historico_d = self._extraer_por_digitos(historico_completo, digitos)
        sorteos_d = self._extraer_sorteos_por_digitos(historico_completo, digitos)
        por_turno = self._preparar_por_turno(historico_completo, turnos, digitos)

        todos_factores = calcular_todos_los_factores(
            historico_d, sorteos_d,
            [n for s in historico_completo for n in s],
            por_turno, turno_actual, digitos
        )

        scores = {}
        factores_destacados = {}

        for n in range(rango):
            score_total = 0.0
            destacados = []
            for factor, peso in self.pesos.items():
                if factor in todos_factores and n in todos_factores[factor]:
                    valor = todos_factores[factor][n]
                    score_total += valor * peso
                    if valor > 0.6:
                        destacados.append(factor)
            scores[n] = score_total
            factores_destacados[n] = destacados[:3]

        if self._entrenado and digitos == 2:
            from .ml_model import predecir_probabilidades
            secuencias_2d = self._extraer_sorteos_por_digitos(historico_completo, 2)
            ventana = min(10, len(secuencias_2d))
            ultimas_secuencias = secuencias_2d[-ventana:] if ventana > 0 else []
            if len(ultimas_secuencias) >= 5:
                probas = predecir_probabilidades(self.xgb_model, self.xgb_calibrated, ultimas_secuencias)
                for num_str, prob in probas.items():
                    n = int(num_str)
                    if n in scores:
                        scores[n] += prob / 100 * 0.15

        max_score = max(scores.values()) if scores else 1
        if max_score > 0:
            for n in scores:
                scores[n] = (scores[n] / max_score) * 100

        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)

        resultados = []
        for n, score in ranked[:top_n]:
            probabilidad = min(95.0, max(0.5, score))
            resultados.append({
                'numero': str(n).zfill(digitos),
                'score': round(score, 2),
                'probabilidad': round(probabilidad, 1),
                'factores': factores_destacados.get(n, [])
            })

        return resultados

    def predecir(self, historico_completo, turnos, turno_actual, top_n_2=10, top_n_3=5, top_n_4=5):
        self.actualizar_pesos_con_historial(historico_completo, turnos)

        if self.usar_xgboost and not self._entrenado and len(historico_completo) >= 20:
            secuencias_2d = self._extraer_sorteos_por_digitos(historico_completo, 2)
            self.entrenar_xgboost(secuencias_2d)

        pred_2 = self.predecir_nivel(historico_completo, turnos, turno_actual, 2, top_n_2)
        pred_3 = self.predecir_nivel(historico_completo, turnos, turno_actual, 3, top_n_3)
        pred_4 = self.predecir_nivel(historico_completo, turnos, turno_actual, 4, top_n_4)

        redoblona = None
        if len(pred_2) >= 2:
            redoblona = f"{pred_2[0]['numero']}-{pred_2[1]['numero']}"

        return {
            'turno': turno_actual,
            'pesos_utilizados': {k: round(v, 4) for k, v in self.pesos.items()},
            'xgboost_activo': self._entrenado,
            'predicciones_2cifras': pred_2,
            'predicciones_3cifras': pred_3,
            'predicciones_4cifras': pred_4,
            'redoblona': redoblona,
        }
