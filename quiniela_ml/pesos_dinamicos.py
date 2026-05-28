"""
Pesos dinámicos: ajusta pesos según qué factores fueron más predictivos
en los últimos 30 sorteos.
"""
import numpy as np
from collections import Counter

PESOS_INICIALES = {
    'frecuencia': 0.18,
    'recencia': 0.14,
    'suma_digitos': 0.14,
    'posicion': 0.10,
    'ciclo': 0.10,
    'tendencia': 0.10,
    'ausencia': 0.08,
    'coocurrencia': 0.08,
    'correlacion_turno': 0.05,
    'caliente': 0.05,
    'atrasado': 0.04,
    'cross_turno': 0.12,
}

NOMBRES_FACTORES = list(PESOS_INICIALES.keys())

def calcular_efectividad_factores(
    historico: list[int],
    scores_historicos: list[dict[int, float]],
    resultados_reales: list[int]
) -> dict[str, float]:
    """
    Calcula qué tan efectivo fue cada factor prediciendo los resultados reales.
    
    Para cada sorteo en el período, evalúa si el número ganador estaba
    en el top-N de cada factor.
    
    Returns:
        dict: factor -> efectividad (0-1)
    """
    if len(resultados_reales) < 5:
        return {f: 1.0 for f in NOMBRES_FACTORES}
    
    aciertos = {f: 0 for f in NOMBRES_FACTORES}
    total = len(resultados_reales)
    
    for i, real in enumerate(resultados_reales):
        if i >= len(scores_historicos):
            break
        scores_sorteo = scores_historicos[i]
        for factor in NOMBRES_FACTORES:
            if factor not in scores_sorteo:
                continue
            # Ver si el número real está en el top 10% de este factor
            ranked = sorted(scores_sorteo[factor].items(), key=lambda x: x[1], reverse=True)
            top_n = max(1, len(ranked) // 10)
            top = {n for n, _ in ranked[:top_n]}
            if real in top:
                aciertos[factor] += 1
    
    efectividad = {}
    for f in NOMBRES_FACTORES:
        efectividad[f] = aciertos[f] / max(total, 1)
    
    return efectividad


def ajustar_pesos(
    efectividad: dict[str, float],
    pesos_actuales: dict[str, float] | None = None,
    tasa_aprendizaje: float = 0.3
) -> dict[str, float]:
    """
    Ajusta los pesos según la efectividad observada.
    
    Args:
        efectividad: dict factor -> tasa de acierto
        pesos_actuales: pesos actuales (o None para usar iniciales)
        tasa_aprendizaje: qué tanto ajustar (0=nada, 1=reemplazo total)
    
    Returns:
        dict: factor -> peso actualizado
    """
    if pesos_actuales is None:
        pesos_actuales = dict(PESOS_INICIALES)
    
    # Normalizar efectividades a pesos
    total_efectividad = sum(efectividad.values())
    if total_efectividad == 0:
        return pesos_actuales
    
    pesos_objetivo = {f: e / total_efectividad for f, e in efectividad.items()}
    
    # Mezclar pesos actuales con objetivo
    nuevos_pesos = {}
    for f in NOMBRES_FACTORES:
        actual = pesos_actuales.get(f, PESOS_INICIALES[f])
        objetivo = pesos_objetivo.get(f, actual)
        nuevos_pesos[f] = actual * (1 - tasa_aprendizaje) + objetivo * tasa_aprendizaje
    
    # Re-normalizar a suma 1
    suma = sum(nuevos_pesos.values())
    if suma > 0:
        for f in nuevos_pesos:
            nuevos_pesos[f] /= suma
    
    return nuevos_pesos


def actualizar_pesos_cada_30(
    historico_completo: list[list[int]],
    digito_fn,
    pesos_actuales: dict[str, float] | None = None,
    ventana: int = 30
) -> dict[str, float]:
    """
    Actualiza pesos cada 30 sorteos evaluando qué factores fueron mejores.
    
    Args:
        historico_completo: lista de sorteos (cada sorteo es lista de ints)
        digito_fn: función que extrae la cantidad correcta de dígitos
        pesos_actuales: pesos actuales o None
    
    Returns:
        dict: factor -> peso actualizado
    """
    if len(historico_completo) < ventana + 10:
        return pesos_actuales or dict(PESOS_INICIALES)
    
    # Usar los últimos `ventana` sorteos para evaluar
    ventana_eval = historico_completo[-ventana:]
    
    # Para cada sorteo en la ventana, calcular scores de cada factor
    from .factores import calcular_todos_los_factores
    
    resultados_reales = []
    scores_historicos = []
    
    # Necesitamos el histórico antes de cada punto de evaluación
    for i in range(len(ventana_eval)):
        idx = len(historico_completo) - ventana + i
        hist_hasta = historico_completo[:idx]
        
        # Aplanar históricos
        hist_flat_4 = [n for s in hist_hasta for n in s]
        hist_flat_d = [digito_fn(n) for n in hist_flat_4]
        
        # Calcular factores
        from .factores import factor_frecuencia, factor_recencia, factor_ciclo, factor_ausencia
        # Versión simplificada para eficiencia
        factores = {}
        rango = 100  # asumiendo 2 dígitos para la evaluación
        factores['frecuencia'] = factor_frecuencia(hist_flat_d, rango)
        factores['recencia'] = factor_recencia(hist_flat_d, 7, rango)
        factores['ciclo'] = factor_ciclo(hist_flat_d, rango)
        factores['ausencia'] = factor_ausencia(hist_flat_d, rango)
        
        scores_historicos.append(factores)
        
        # Número real (primer número del sorteo)
        real = ventana_eval[i]
        resultados_reales.append(digito_fn(real))
    
    efectividad = calcular_efectividad_factores(
        [digito_fn(n) for s in historico_completo for n in s],
        scores_historicos,
        resultados_reales
    )
    
    return ajustar_pesos(efectividad, pesos_actuales)
