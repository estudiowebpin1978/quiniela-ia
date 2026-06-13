"""
Bayesian Hyperparameter Optimization using Optuna
Optimizes ensemble weights and model parameters for each turno.
Output: modelos_exportados/optimizer_results.json
"""

import os, json, sys
import numpy as np

# Load .env.local
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import SUPABASE_URL, SUPABASE_KEY

try:
    import optuna
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    HAS_OPTUNA = True
except ImportError:
    HAS_OPTUNA = False
    print("WARNING: optuna not installed. Run: pip install optuna")

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

EXPORT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "modelos_exportados")
os.makedirs(EXPORT_DIR, exist_ok=True)

TURNOS = ["previa", "primera", "matutina", "vespertina", "nocturna"]


def fetch_draws(turno, limit=500):
    if not HAS_REQUESTS or not SUPABASE_KEY:
        return []
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/draws",
            params={
                "select": "date,turno,numbers",
                "turno": f"ilike.*{turno}*",
                "order": "date.desc",
                "limit": limit
            },
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            timeout=15
        )
        return r.json() if r.ok else []
    except:
        return []


def build_features(draws, num_idx=0):
    """Build feature vector for a number at position num_idx in future draws."""
    all_nums = []
    for d in draws:
        if isinstance(d.get("numbers"), list) and len(d["numbers"]) >= 20:
            all_nums.append([n % 100 for n in d["numbers"]])

    if len(all_nums) < 20:
        return None, None

    features_list = []
    labels = []

    for i in range(20, len(all_nums)):
        past = all_nums[:i]
        future = all_nums[i]

        # Features
        flat = [n for draw in past for n in draw]
        freq = np.zeros(100)
        for n in flat:
            freq[n] += 1
        freq /= max(len(flat), 1)

        last_draw = set(past[-1])
        last20 = [n for d in past[-20:] for n in d]
        freq20 = np.zeros(100)
        for n in last20:
            freq20[n] += 1
        freq20 /= max(len(last20), 1)

        # Absence
        absence = np.zeros(100)
        for num in range(100):
            for j in range(len(past) - 1, -1, -1):
                if num in past[j]:
                    absence[num] = (len(past) - j) / len(past)
                    break
            else:
                absence[num] = 1.0

        feat = np.concatenate([
            freq,
            freq20,
            absence,
            [len(past) / 500],
        ])
        features_list.append(feat)

        # Label: did this number appear in the next draw?
        target_num = flat[-(100 - num_idx)] if num_idx < len(past[-1]) else 0
        label = 1 if target_num in future else 0
        labels.append(label)

    return np.array(features_list), np.array(labels)


def optimize_turno(turno, n_trials=50):
    if not HAS_OPTUNA:
        return None

    draws = fetch_draws(turno, 500)
    if len(draws) < 30:
        print(f"  {turno}: insufficient data ({len(draws)} draws)")
        return None

    X, y = build_features(draws)
    if X is None or len(X) < 50:
        print(f"  {turno}: insufficient features")
        return None

    def objective(trial):
        # Ensemble weights
        w_freq = trial.suggest_float("w_freq", 0.1, 0.6)
        w_freq20 = trial.suggest_float("w_freq20", 0.05, 0.4)
        w_absence = trial.suggest_float("w_absence", 0.05, 0.3)

        # Combine features with trial weights
        n_samples = X.shape[0]
        n_feat = 100
        combined = (
            X[:, :n_feat] * w_freq +
            X[:, n_feat:2*n_feat] * w_freq20 +
            X[:, 2*n_feat:3*n_feat] * w_absence
        )

        # Score each number
        hits = 0
        total = 0
        for i in range(n_samples):
            top10 = np.argsort(combined[i])[-10:]
            if y[i] in top10:
                hits += 1
            total += 1

        return hits / max(total, 1)

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)

    best = study.best_params
    result = {
        "turno": turno,
        "best_score": study.best_value,
        "weights": {
            "frecuenciaHistorica": best["w_freq"],
            "frecuencia20": best["w_freq20"],
            "ausencia": best["w_absence"],
        },
        "n_trials": n_trials,
        "n_draws": len(draws),
        "timestamp": __import__("datetime").datetime.now().isoformat()
    }

    return result


def main():
    if not HAS_OPTUNA:
        print("ERROR: optuna not installed. Run: pip install optuna")
        sys.exit(1)

    print("=== Bayesian Hyperparameter Optimization ===")
    results = {}

    for turno in TURNOS:
        print(f"\nOptimizing {turno}...")
        result = optimize_turno(turno, n_trials=50)
        if result:
            results[turno] = result
            print(f"  Best score: {result['best_score']:.4f}")
            print(f"  Weights: {result['weights']}")
        else:
            print(f"  Skipped (insufficient data)")

    output_path = os.path.join(EXPORT_DIR, "optimizer_results.json")
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nResults saved to {output_path}")


if __name__ == "__main__":
    main()
