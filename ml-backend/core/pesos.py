"""Pesos dinámicos: ajusta pesos según qué factores fueron más predictivos."""
import numpy as np
from collections import Counter

PESOS_INICIALES = {
    'frecuencia': 0.18, 'recencia': 0.14, 'suma_digitos': 0.14,
    'posicion': 0.10, 'ciclo': 0.10, 'tendencia': 0.10,
    'ausencia': 0.08, 'coocurrencia': 0.08, 'correlacion_turno': 0.05,
    'caliente': 0.05, 'atrasado': 0.04, 'cross_turno': 0.12,
}

NOMBRES_FACTORES = list(PESOS_INICIALES.keys())


def calcular_efectividad_factores(historico, scores_historicos, resultados_reales):
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
            ranked = sorted(scores_sorteo[factor].items(), key=lambda x: x[1], reverse=True)
            top_n = max(1, len(ranked) // 10)
            top = {n for n, _ in ranked[:top_n]}
            if real in top:
                aciertos[factor] += 1

    return {f: aciertos[f] / max(total, 1) for f in NOMBRES_FACTORES}


def ajustar_pesos(efectividad, pesos_actuales=None, tasa_aprendizaje=0.3):
    if pesos_actuales is None:
        pesos_actuales = dict(PESOS_INICIALES)

    total_efectividad = sum(efectividad.values())
    if total_efectividad == 0:
        return pesos_actuales

    pesos_objetivo = {f: e / total_efectividad for f, e in efectividad.items()}
    nuevos_pesos = {}
    for f in NOMBRES_FACTORES:
        actual = pesos_actuales.get(f, PESOS_INICIALES[f])
        objetivo = pesos_objetivo.get(f, actual)
        nuevos_pesos[f] = actual * (1 - tasa_aprendizaje) + objetivo * tasa_aprendizaje

    suma = sum(nuevos_pesos.values())
    if suma > 0:
        for f in nuevos_pesos:
            nuevos_pesos[f] /= suma

    return nuevos_pesos
