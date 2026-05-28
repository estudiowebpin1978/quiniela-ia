import numpy as np
from collections import Counter, defaultdict
from typing import Callable

# ============================================
# 12 FACTORES DE ANÁLISIS
# ============================================

def factor_frecuencia(historico: list[int], rango: int) -> dict[int, float]:
    """Factor 1: Frecuencia absoluta de cada número en el histórico"""
    freq = Counter(historico)
    total = max(len(historico), 1)
    return {n: freq.get(n, 0) / total for n in range(rango)}

def factor_posicion(historico_completo: list[int], digitos: int) -> dict[int, float]:
    """Factor 2: Frecuencia de cada dígito en cada posición (últimos `digitos` dígitos)"""
    pos_freq = [Counter() for _ in range(digitos)]
    for num in historico_completo:
        # Usar los últimos `digitos` dígitos del número
        s = str(num).zfill(4)[-digitos:]
        if len(s) != digitos:
            continue
        for i, ch in enumerate(s):
            pos_freq[i][int(ch)] += 1
    total = max(len(historico_completo), 1)
    rango = 10 ** digitos
    scores = {}
    for n in range(rango):
        s = str(n).zfill(digitos)
        score = 0.0
        for i, ch in enumerate(s):
            score += pos_freq[i].get(int(ch), 0) / total
        scores[n] = score / digitos if digitos > 0 else 0.0
    return scores

def factor_recencia(historico: list[int], ultimos_n: int, rango: int) -> dict[int, float]:
    """Factor 3: Si apareció en los últimos N sorteos"""
    recientes = set(historico[-ultimos_n:]) if len(historico) >= ultimos_n else set(historico)
    return {n: 1.0 if n in recientes else 0.0 for n in range(rango)}

def factor_tendencia(historico: list[int], ventana_reciente: int, ventana_anterior: int, rango: int) -> dict[int, float]:
    """Factor 4: Compara frecuencia reciente vs anterior"""
    if len(historico) < ventana_reciente + ventana_anterior:
        return {n: 0.0 for n in range(rango)}
    reciente = Counter(historico[-ventana_reciente:])
    anterior = Counter(historico[-(ventana_reciente + ventana_anterior):-ventana_reciente])
    scores = {}
    for n in range(rango):
        f_reciente = reciente.get(n, 0) / max(ventana_reciente, 1)
        f_anterior = anterior.get(n, 0) / max(ventana_anterior, 1)
        diff = f_reciente - f_anterior
        # Normalizar a [-1, 1]
        scores[n] = max(-1.0, min(1.0, diff * 10))
    return scores

def factor_ciclo(historico: list[int], rango: int) -> dict[int, float]:
    """Factor 5: Estima si un número está 'a punto' de salir según su ciclo"""
    scores = {}
    for n in range(rango):
        indices = [i for i, x in enumerate(historico) if x == n]
        if len(indices) < 2:
            scores[n] = 0.0
            continue
        gaps = [indices[i+1] - indices[i] for i in range(len(indices)-1)]
        ciclo_prom = np.mean(gaps)
        ultimo_gap = len(historico) - indices[-1]
        # Si el gap actual es >= el ciclo promedio, está "atrasado" -> más probable
        if ciclo_prom > 0:
            scores[n] = min(1.0, ultimo_gap / ciclo_prom)
        else:
            scores[n] = 0.0
    return scores

def factor_ausencia(historico: list[int], rango: int) -> dict[int, float]:
    """Factor 6: Número de sorteos desde la última aparición"""
    scores = {}
    total = len(historico)
    for n in range(rango):
        indices = [i for i, x in enumerate(historico) if x == n]
        if not indices:
            scores[n] = 1.0  # Nunca salió -> máxima ausencia
        else:
            ausencia = total - indices[-1]
            scores[n] = min(1.0, ausencia / max(total, 1) * 2)
    return scores

def factor_coocurrencia(historico_completo: list[list[int]], rango: int) -> dict[int, float]:
    """Factor 7: Pares de números que suelen salir juntos en un mismo sorteo"""
    cooc = defaultdict(Counter)
    for sorteo in historico_completo:
        for i, a in enumerate(sorteo):
            for b in sorteo[i+1:]:
                if a != b:
                    cooc[a][b] += 1
    scores = {}
    total_sorteos = max(len(historico_completo), 1)
    for n in range(rango):
        total_cooc = sum(cooc[n].values())
        scores[n] = min(1.0, total_cooc / total_sorteos * 2)
    return scores

def factor_correlacion_turno(por_turno: dict[str, list[int]], turno_actual: str, rango: int) -> dict[int, float]:
    """Factor 8: Frecuencia de cada número en un turno específico"""
    historico_turno = por_turno.get(turno_actual, [])
    if not historico_turno:
        return {n: 0.0 for n in range(rango)}
    freq = Counter(historico_turno)
    total = max(len(historico_turno), 1)
    return {n: freq.get(n, 0) / total for n in range(rango)}

def factor_caliente(historico: list[int], racha: int = 3, rango: int = 100) -> dict[int, float]:
    """Factor 9: Indicador de racha si salió en últimos 1-3 sorteos consecutivos"""
    scores = {}
    for n in range(rango):
        indices = [i for i, x in enumerate(historico) if x == n]
        if not indices:
            scores[n] = 0.0
            continue
        # Contar racha actual (desde el final hacia atrás)
        racha_actual = 0
        for i in range(1, min(racha + 1, len(historico) + 1)):
            if historico[-i] == n:
                racha_actual += 1
            else:
                break
        if racha_actual >= 2:
            scores[n] = 1.0  # racha de 2+
        elif racha_actual == 1:
            scores[n] = 0.5  # salió en el último
        else:
            scores[n] = 0.0
    return scores

def factor_atrasado(historico: list[int], umbral: float = 0.8, rango: int = 100) -> dict[int, float]:
    """Factor 10: Indicador si está muy atrasado (porcentaje del tiempo total sin salir)"""
    scores = {}
    total = len(historico)
    for n in range(rango):
        indices = [i for i, x in enumerate(historico) if x == n]
        if not indices:
            scores[n] = 1.0
            continue
        ultimo_idx = indices[-1]
        pct_ausente = (total - ultimo_idx) / max(total, 1)
        scores[n] = 1.0 if pct_ausente >= umbral else pct_ausente / umbral
    return scores

def factor_cross_turno(por_turno_ordenado: dict[str, list[int]], turno_actual: str, rango: int) -> dict[int, float]:
    """Factor 11: Usa información de otros turnos del mismo día"""
    scores = {n: 0.0 for n in range(rango)}
    turnos = list(por_turno_ordenado.keys())
    if turno_actual not in turnos:
        return scores
    idx_actual = turnos.index(turno_actual)
    # Mirar turnos anteriores del mismo día
    for i in range(idx_actual):
        turno_prev = turnos[i]
        nums_prev = por_turno_ordenado.get(turno_prev, [])
        if nums_prev:
            ultimos = nums_prev[-20:] if len(nums_prev) >= 20 else nums_prev
            for n in ultimos:
                scores[n % rango] += 0.3
    # Escalar
    max_score = max(scores.values()) if scores else 1
    if max_score > 0:
        for n in scores:
            scores[n] /= max_score
    return scores

def factor_suma_digitos(numeros_completos: list[int], digitos: int, rango: int) -> dict[int, float]:
    """Factor 12: Patrón en la suma de los últimos `digitos` dígitos"""
    suma_counts = Counter()
    for num in numeros_completos:
        s = sum(int(d) for d in str(num).zfill(4)[-digitos:])
        suma_counts[s] += 1
    total = max(len(numeros_completos), 1)
    scores = {}
    for n in range(rango):
        s = sum(int(d) for d in str(n).zfill(digitos))
        scores[n] = suma_counts.get(s, 0) / total
    return scores


def calcular_todos_los_factores(
    historico: list[int],
    historico_completo: list[list[int]],
    numeros_completos: list[int],
    por_turno: dict[str, list[int]],
    turno_actual: str,
    digitos: int
) -> dict[str, dict[int, float]]:
    """
    Calcula los 12 factores para un nivel de dígitos (2, 3 o 4).
    
    Args:
        historico: números con la cantidad de dígitos especificada
        historico_completo: sorteos completos de 4 cifras como listas
        numeros_completos: todos los números de 4 cifras aplanados
        por_turno: dict turno -> lista de números
        turno_actual: turno a predecir
        digitos: 2, 3 o 4
    
    Returns:
        dict con nombre_factor -> {numero: score}
    """
    rango = 10 ** digitos
    
    return {
        'frecuencia': factor_frecuencia(historico, rango),
        'posicion': factor_posicion(numeros_completos, digitos),
        'recencia': factor_recencia(historico, 7, rango),
        'tendencia': factor_tendencia(historico, 30, 30, rango),
        'ciclo': factor_ciclo(historico, rango),
        'ausencia': factor_ausencia(historico, rango),
        'coocurrencia': factor_coocurrencia(historico_completo, rango),
        'correlacion_turno': factor_correlacion_turno(por_turno, turno_actual, rango),
        'caliente': factor_caliente(historico, 3, rango),
        'atrasado': factor_atrasado(historico, 0.8, rango),
        'cross_turno': factor_cross_turno(por_turno, turno_actual, rango),
        'suma_digitos': factor_suma_digitos(numeros_completos, digitos, rango),
    }
