"""
LightGBM + XGBoost training pipeline.
Trains both models and returns per-number prediction scores.
"""
import numpy as np
from collections import Counter

try:
    import lightgbm as lgb
    HAS_LGB = True
except ImportError:
    HAS_LGB = False

try:
    import xgboost as xgb
    HAS_XGB = True
except ImportError:
    HAS_XGB = False

try:
    from sklearn.model_selection import cross_val_score
    from sklearn.metrics import accuracy_score
    HAS_SK = True
except ImportError:
    HAS_SK = False


def freq_window(seqs, n, target):
    window = seqs[:n]
    if not window:
        return 0
    return sum(1 for s in window if target in s) / len(window)


def absence_score(seqs, target):
    for i, s in enumerate(seqs):
        if target in s:
            return i / max(len(seqs), 1), i / max(len(seqs), 1)
    return 1.0, 1.0


def interval_stats(seqs, target):
    positions = [i for i, s in enumerate(seqs) if target in s]
    if len(positions) < 2:
        return len(seqs), 0
    intervals = [positions[i+1] - positions[i] for i in range(len(positions)-1)]
    avg = sum(intervals) / len(intervals)
    var = sum((x - avg)**2 for x in intervals) / len(intervals)
    return avg, var**0.5


def momentum_score(seqs, target):
    c7 = sum(1 for s in seqs[:7] if target in s)
    c30 = sum(1 for s in seqs[:30] if target in s)
    r7 = c7 / 7
    r30 = c30 / 30
    return r7, (r7 - r30) / r30 if r30 > 0 else 0


def cycle_avg(seqs, target):
    positions = [i for i, s in enumerate(seqs) if target in s]
    if len(positions) < 2:
        return len(seqs)
    intervals = [positions[i+1] - positions[i] for i in range(len(positions)-1)]
    return sum(intervals) / len(intervals)


def repeat_prob(seqs, target):
    if len(seqs) < 2:
        return 0
    repeated = sum(1 for i in range(len(seqs)-1) if target in seqs[i] and target in seqs[i+1])
    appeared = sum(1 for i in range(len(seqs)-1) if target in seqs[i])
    return repeated / appeared if appeared > 0 else 0


def coocurrence_score(seqs, target):
    cooc = {}
    for s in seqs[:50]:
        if target in s:
            for n in s:
                if n != target:
                    cooc[n] = cooc.get(n, 0) + 1
    return max(cooc.values()) / 50 if cooc else 0


def mirror_score(seqs, target):
    tens, units = target // 10, target % 10
    mirror = units * 10 + tens
    c1 = sum(1 for s in seqs[:50] if target in s)
    c2 = sum(1 for s in seqs[:50] if mirror in s)
    return (c1 + c2) / 100


def neighbor_score(seqs, target):
    neighbors = [(target-2+100)%100, (target-1+100)%100, (target+1)%100, (target+2)%100]
    count = sum(1 for s in seqs[:20] for n in neighbors if n in s)
    return count / 80


def parity(target):
    return 1 if target % 2 == 0 else 0


def digital_root(target):
    n = target
    while n >= 10:
        n = n // 10 + n % 10
    return n / 9


def digit_sum(target):
    return (target // 10 + target % 10) / 18


def day_of_week(date_str):
    from datetime import datetime
    try:
        d = datetime.strptime(date_str[:10], "%Y-%m-%d")
        return d.weekday() / 6
    except Exception:
        return 0.5


def month_num(date_str):
    from datetime import datetime
    try:
        d = datetime.strptime(date_str[:10], "%Y-%m-%d")
        return d.month / 12
    except Exception:
        return 0.5


def turno_code(turno):
    m = {"previa": 0, "primera": 0.25, "matutina": 0.5, "vespertina": 0.75, "nocturna": 1}
    return m.get(turno.lower(), 0.5) if turno else 0.5


def markov_scores(seqs, target):
    if len(seqs) < 2:
        return 0, 0
    m1 = 0
    for n in seqs[0]:
        t = n % 100
        cooc = sum(1 for s in seqs[:50] if t in s and target in s)
        m1 += cooc
    m2 = 0
    if len(seqs) >= 3:
        for n in seqs[2]:
            t = n % 100
            cooc = sum(1 for s in seqs[:50] if t in s and target in s)
            m2 += cooc
    return min(1, m1/200), min(1, m2/200)


def entropy_score(seqs, target):
    count = sum(1 for s in seqs if target in s)
    p = count / max(len(seqs), 1)
    if p == 0 or p == 1:
        return 0
    return -p * np.log2(p) - (1-p) * np.log2(1-p)


def hot_cold(seqs, target):
    recent = sum(1 for s in seqs[:10] if target in s)
    long = sum(1 for s in seqs if target in s)
    r_rate = recent / 10
    l_rate = long / max(len(seqs), 1)
    if l_rate > 0:
        return r_rate / l_rate
    return 2 if r_rate > 0 else 0.5


def extract_features_25(seqs, dates, target):
    f1 = freq_window(seqs, 10, target)
    f2 = freq_window(seqs, 20, target)
    f3 = freq_window(seqs, 50, target)
    f4 = freq_window(seqs, 100, target)
    abs5, abs6 = absence_score(seqs, target)
    int7, int8 = interval_stats(seqs, target)
    f7 = int7 / max(len(seqs), 1)
    f8 = int8 / max(int7, 1)
    m9, m10 = momentum_score(seqs, target)
    f11 = cycle_avg(seqs, target) / max(len(seqs), 1)
    f12 = repeat_prob(seqs, target)
    f13 = coocurrence_score(seqs, target)
    f14 = mirror_score(seqs, target)
    f15 = neighbor_score(seqs, target)
    f16 = parity(target)
    f17 = digital_root(target)
    f18 = digit_sum(target)
    f19 = day_of_week(dates[0]) if dates else 0.5
    f20 = month_num(dates[0]) if dates else 0.5
    f21 = turno_code(dates[0]) if dates else 0.5
    mk1, mk2 = markov_scores(seqs, target)
    f24 = entropy_score(seqs, target)
    f25 = hot_cold(seqs, target)

    return [f1, f2, f3, f4, abs5, abs6, f7, f8, m9, m10, f11, f12, f13, f14, f15,
            f16, f17, f18, f19, f20, f21, mk1, mk2, f24, f25]


def build_dataset(seqs, dates, window=50):
    X, y = [], []
    for i in range(window, len(seqs)):
        hist_seqs = list(reversed(seqs[i-window:i]))
        hist_dates = list(reversed(dates[i-window:i]))
        actual = seqs[i]
        for num in range(100):
            feats = extract_features_25(hist_seqs, hist_dates, num)
            X.append(feats)
            y.append(1 if num in actual else 0)
    return np.array(X), np.array(y)


def train_lgbm(X, y):
    if not HAS_LGB:
        return None
    model = lgb.LGBMClassifier(
        n_estimators=300, max_depth=6, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, reg_lambda=1.0,
        reg_alpha=0.1, min_child_samples=20,
        random_state=42, n_jobs=-1, verbose=-1
    )
    model.fit(X, y)
    return model


def train_xgboost(X, y):
    if not HAS_XGB:
        return None
    model = xgb.XGBClassifier(
        n_estimators=300, max_depth=6, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, reg_lambda=1.0,
        random_state=42, n_jobs=-1, verbosity=0
    )
    model.fit(X, y)
    return model


def predict_scores(model, seqs, dates, window=50):
    if model is None:
        return {str(n).zfill(2): 0.0 for n in range(100)}

    hist_seqs = list(reversed(seqs[-window:]))
    hist_dates = list(reversed(dates[-window:]))

    features = []
    for num in range(100):
        features.append(extract_features_25(hist_seqs, hist_dates, num))

    X_pred = np.array(features)
    probas = model.predict_proba(X_pred)[:, 1]

    scores = {}
    for n in range(100):
        scores[str(n).zfill(2)] = round(float(probas[n] * 100), 2)
    return scores


def train_lgbm_xgboost(seqs, dates, window=50):
    """Train both models and return (lgbm_scores, xgb_scores, ensemble_scores)."""
    if len(seqs) < window + 10:
        empty = {str(n).zfill(2): 0.0 for n in range(100)}
        return empty, empty, empty

    X, y = build_dataset(seqs, dates, window)
    if len(X) < 50:
        empty = {str(n).zfill(2): 0.0 for n in range(100)}
        return empty, empty, empty

    lgbm_model = train_lgbm(X, y)
    xgb_model = train_xgboost(X, y)

    lgbm_scores = predict_scores(lgbm_model, seqs, dates, window) if lgbm_model else {str(n).zfill(2): 0.0 for n in range(100)}
    xgb_scores = predict_scores(xgb_model, seqs, dates, window) if xgb_model else {str(n).zfill(2): 0.0 for n in range(100)}

    ensemble_scores = {}
    for n in range(100):
        k = str(n).zfill(2)
        if lgbm_model and xgb_model:
            ensemble_scores[k] = round((lgbm_scores[k] + xgb_scores[k]) / 2, 2)
        elif lgbm_model:
            ensemble_scores[k] = lgbm_scores[k]
        elif xgb_model:
            ensemble_scores[k] = xgb_scores[k]
        else:
            ensemble_scores[k] = 0.0

    return lgbm_scores, xgb_scores, ensemble_scores


def predict_scores_lgbm_xgboost(seqs, dates, window=50):
    """Get ensemble prediction scores for the current state."""
    _, _, ensemble_scores = train_lgbm_xgboost(seqs, dates, window)
    return ensemble_scores
