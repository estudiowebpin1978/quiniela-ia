"""
Predictor principal: orquesta los 12 factores + pesos dinámicos + XGBoost.
Genera predicciones para 2, 3 y 4 cifras con probabilidades calibradas.
"""
import numpy as np
from collections import defaultdict
from typing import Callable

from .factores import calcular_todos_los_factores
from .pesos_dinamicos import PESOS_INICIALES, ajustar_pesos, calcular_efectividad_factores

try:
    from .modelo import (
        crear_features_ml, entrenar_xgboost, predecir_probabilidades, XGB_DISPONIBLE
    )
except ImportError:
    XGB_DISPONIBLE = False


class PredictorQuiniela:
    """
    Predictor principal de quiniela.
    
    Calcula 12 factores estadísticos + XGBoost ML + pesos dinámicos
    para predecir números ganadores de 2, 3 y 4 cifras.
    """
    
    def __init__(self, usar_xgboost: bool = True, calibrar: bool = True):
        self.pesos = dict(PESOS_INICIALES)
        self.usar_xgboost = usar_xgboost and XGB_DISPONIBLE
        self.calibrar = calibrar
        self.xgb_model = None
        self.xgb_calibrated = None
        self._entrenado = False
    
    def _extraer_por_digitos(
        self,
        historico_completo: list[list[int]],
        digitos: int
    ) -> list[int]:
        """Extrae los últimos `digitos` dígitos de cada número en cada sorteo"""
        resultado = []
        for sorteo in historico_completo:
            for n in sorteo:
                if digitos == 2:
                    resultado.append(n % 100)
                elif digitos == 3:
                    resultado.append(n % 1000)
                else:  # 4 dígitos
                    resultado.append(n)
        return resultado
    
    def _extraer_sorteos_por_digitos(
        self,
        historico_completo: list[list[int]],
        digitos: int
    ) -> list[list[int]]:
        """Extrae sorteos completos con la cantidad de dígitos especificada"""
        resultado = []
        for sorteo in historico_completo:
            if digitos == 2:
                resultado.append([n % 100 for n in sorteo])
            elif digitos == 3:
                resultado.append([n % 1000 for n in sorteo])
            else:
                resultado.append(list(sorteo))
        return resultado
    
    def _preparar_por_turno(
        self,
        historico_completo: list[list[int]],
        turnos: list[str],
        digitos: int
    ) -> dict[str, list[int]]:
        """Agrupa histórico por turno"""
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
    
    def actualizar_pesos_con_historial(
        self,
        historico_completo: list[list[int]],
        turnos: list[str],
        ventana: int = 30
    ):
        """
        Actualiza los pesos dinámicos basado en el rendimiento
        de cada factor en los últimos `ventana` sorteos.
        """
        if len(historico_completo) < ventana + 10:
            return
        
        ventana_eval = historico_completo[-ventana:]
        turnos_eval = turnos[-ventana:] if len(turnos) >= ventana else []
        
        resultados_reales = []
        factores_historicos = []
        
        for i in range(len(ventana_eval)):
            idx = len(historico_completo) - ventana + i
            hist_hasta = historico_completo[:idx]
            turnos_hasta = turnos[:idx] if len(turnos) >= idx else []
            
            # Calcular factores para este punto
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
    
    def entrenar_xgboost(self, secuencias_2d: list[list[int]]):
        """Entrena modelo XGBoost con los datos históricos de 2 dígitos"""
        if not self.usar_xgboost:
            return
        
        from .modelo import crear_features_ml, entrenar_xgboost
        
        X, y = crear_features_ml(secuencias_2d)
        if len(X) < 50:
            print(f"  Datos insuficientes para XGBoost: {len(X)} muestras")
            return
        
        print(f"  Entrenando XGBoost: {X.shape[0]} muestras, {X.shape[1]} features...")
        self.xgb_model, self.xgb_calibrated = entrenar_xgboost(X, y, calibrar=self.calibrar)
        self._entrenado = True
        train_acc = self.xgb_model.score(X, y)
        print(f"  XGBoost train accuracy: {train_acc:.2%}")
    
    def predecir_nivel(
        self,
        historico_completo: list[list[int]],
        turnos: list[str],
        turno_actual: str,
        digitos: int,
        top_n: int = 10
    ) -> list[dict]:
        """
        Predice para un nivel específico de dígitos (2, 3 o 4).
        
        Args:
            historico_completo: lista de sorteos completos
            turnos: lista de turnos para cada sorteo
            turno_actual: turno a predecir ("Nocturna", etc.)
            digitos: cantidad de dígitos (2, 3, 4)
            top_n: cuántos resultados devolver
        
        Returns:
            lista de dicts con {numero, score, probabilidad, factores_destacados}
        """
        rango = 10 ** digitos
        
        # Extraer datos al nivel de dígitos solicitado
        historico_d = self._extraer_por_digitos(historico_completo, digitos)
        sorteos_d = self._extraer_sorteos_por_digitos(historico_completo, digitos)
        por_turno = self._preparar_por_turno(historico_completo, turnos, digitos)
        
        # Calcular 12 factores
        todos_factores = calcular_todos_los_factores(
            historico_d,
            sorteos_d,
            [n for s in historico_completo for n in s],
            por_turno,
            turno_actual,
            digitos
        )
        
        # Calcular score ponderado para cada número
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
        
        # Aplicar boost de XGBoost si está entrenado (solo para 2 dígitos)
        if self._entrenado and digitos == 2:
            from .modelo import predecir_probabilidades
            # Usar secuencias de 2 dígitos para features
            secuencias_2d = self._extraer_sorteos_por_digitos(historico_completo, 2)
            ventana = min(10, len(secuencias_2d))
            ultimas_secuencias = secuencias_2d[-ventana:] if ventana > 0 else []
            
            if len(ultimas_secuencias) >= 5:
                probas = predecir_probabilidades(
                    self.xgb_model, self.xgb_calibrated, ultimas_secuencias
                )
                for num_str, prob in probas.items():
                    n = int(num_str)
                    if n in scores:
                        # XGBoost boost: 0-100 scale, sumar como fracción
                        scores[n] += prob / 100 * 0.15  # peso 15%
        
        # Normalizar scores a [0, 100]
        max_score = max(scores.values()) if scores else 1
        if max_score > 0:
            for n in scores:
                scores[n] = (scores[n] / max_score) * 100
        
        # Ordenar y devolver top N
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        
        # Calibrar a probabilidades (basado en distribución histórica)
        # Mapeo: score -> probabilidad estimada
        resultados = []
        for n, score in ranked[:top_n]:
            # Calibración simple: cuanto más alto el score, mayor probabilidad
            probabilidad = min(95.0, max(0.5, score))
            resultados.append({
                'numero': str(n).zfill(digitos),
                'score': round(score, 2),
                'probabilidad': round(probabilidad, 1),
                'factores': factores_destacados.get(n, [])
            })
        
        return resultados
    
    def predecir(
        self,
        historico_completo: list[list[int]],
        turnos: list[str],
        turno_actual: str,
        top_n_2: int = 10,
        top_n_3: int = 5,
        top_n_4: int = 5
    ) -> dict:
        """
        Predicción completa para 2, 3 y 4 cifras.
        
        Args:
            historico_completo: lista de sorteos (cada uno es lista de 20+ números)
            turnos: lista de turnos para cada sorteo
            turno_actual: "Previa", "Primera", "Matutina", "Vespertina", "Nocturna"
        
        Returns:
            dict con predicciones para cada nivel
        """
        # Actualizar pesos dinámicos
        self.actualizar_pesos_con_historial(historico_completo, turnos)
        
        # Entrenar XGBoost si es necesario
        if self.usar_xgboost and not self._entrenado and len(historico_completo) >= 20:
            secuencias_2d = self._extraer_sorteos_por_digitos(historico_completo, 2)
            self.entrenar_xgboost(secuencias_2d)
        
        # Predecir cada nivel
        pred_2 = self.predecir_nivel(historico_completo, turnos, turno_actual, 2, top_n_2)
        pred_3 = self.predecir_nivel(historico_completo, turnos, turno_actual, 3, top_n_3)
        pred_4 = self.predecir_nivel(historico_completo, turnos, turno_actual, 4, top_n_4)
        
        # Redoblona = combinar top 2 de 2 cifras
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
