"""12 factores de análisis estadístico."""
import numpy as np
from collections import Counter, defaultdict


def factor_frecuencia(historico, rango):
    freq = Counter(historico)
    total = max(len(historico), 1)
    return {n: freq.get(n, 0) / total for n in range(rango)}


def factor_posicion(historico_completo, digitos):
    pos_freq = [Counter() for _ in range(digitos)]
    for num in historico_completo:
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
        score = sum(pos_freq[i].get(int(ch), 0) / total for i, ch in enumerate(s))
        scores[n] = score / digitos if digitos > 0 else 0.0
    return scores


def factor_recencia(historico, ultimos_n, rango):
    recientes = set(historico[-ultimos_n:]) if len(historico) >= ultimos_n else set(historico)
    return {n: 1.0 if n in recientes else 0.0 for n in range(rango)}


def factor_tendencia(historico, ventana_reciente, ventana_anterior, rango):
    if len(historico) < ventana_reciente + ventana_anterior:
        return {n: 0.0 for n in range(rango)}
    reciente = Counter(historico[-ventana_reciente:])
    anterior = Counter(historico[-(ventana_reciente + ventana_anterior):-ventana_reciente])
    scores = {}
    for n in range(rango):
        f_reciente = reciente.get(n, 0) / max(ventana_reciente, 1)
        f_anterior = anterior.get(n, 0) / max(ventana_anterior, 1)
        diff = f_reciente - f_anterior
        scores[n] = max(-1.0, min(1.0, diff * 10))
    return scores


def factor_ciclo(historico, rango):
    scores = {}
    for n in range(rango):
        indices = [i for i, x in enumerate(historico) if x == n]
        if len(indices) < 2:
            scores[n] = 0.0
            continue
        gaps = [indices[i+1] - indices[i] for i in range(len(indices)-1)]
        ciclo_prom = np.mean(gaps)
        ultimo_gap = len(historico) - indices[-1]
        if ciclo_prom > 0:
            scores[n] = min(1.0, ultimo_gap / ciclo_prom)
        else:
            scores[n] = 0.0
    return scores


def factor_ausencia(historico, rango):
    scores = {}
    total = len(historico)
    for n in range(rango):
        indices = [i for i, x in enumerate(historico) if x == n]
        if not indices:
            scores[n] = 1.0
        else:
            ausencia = total - indices[-1]
            scores[n] = min(1.0, ausencia / max(total, 1) * 2)
    return scores


def factor_coocurrencia(historico_completo, rango):
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


def factor_correlacion_turno(por_turno, turno_actual, rango):
    historico_turno = por_turno.get(turno_actual, [])
    if not historico_turno:
        return {n: 0.0 for n in range(rango)}
    freq = Counter(historico_turno)
    total = max(len(historico_turno), 1)
    return {n: freq.get(n, 0) / total for n in range(rango)}


def factor_caliente(historico, racha=3, rango=100):
    scores = {}
    for n in range(rango):
        indices = [i for i, x in enumerate(historico) if x == n]
        if not indices:
            scores[n] = 0.0
            continue
        racha_actual = 0
        for i in range(1, min(racha + 1, len(historico) + 1)):
            if historico[-i] == n:
                racha_actual += 1
            else:
                break
        if racha_actual >= 2:
            scores[n] = 1.0
        elif racha_actual == 1:
            scores[n] = 0.5
        else:
            scores[n] = 0.0
    return scores


def factor_atrasado(historico, umbral=0.8, rango=100):
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


def factor_cross_turno(por_turno_ordenado, turno_actual, rango):
    scores = {n: 0.0 for n in range(rango)}
    turnos = list(por_turno_ordenado.keys())
    if turno_actual not in turnos:
        return scores
    idx_actual = turnos.index(turno_actual)
    for i in range(idx_actual):
        turno_prev = turnos[i]
        nums_prev = por_turno_ordenado.get(turno_prev, [])
        if nums_prev:
            ultimos = nums_prev[-20:] if len(nums_prev) >= 20 else nums_prev
            for n in ultimos:
                scores[n % rango] += 0.3
    max_score = max(scores.values()) if scores else 1
    if max_score > 0:
        for n in scores:
            scores[n] /= max_score
    return scores


def factor_suma_digitos(numeros_completos, digitos, rango):
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


def calcular_todos_los_factores(historico, historico_completo, numeros_completos, por_turno, turno_actual, digitos):
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
