"""
Deep Learning Training Pipeline: LSTM + Transformer + Bayesian Neural Network
Exports trained models to JSON for Node.js API consumption.

Requirements: pip install tensorflow numpy requests
Output: modelos_exportados/lstm_{turno}.json, transformer_{turno}.json, bnn_{turno}.json
"""

import os, json, sys
import numpy as np

try:
    import tensorflow as tf
    tf.get_logger().setLevel('ERROR')
    os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
    HAS_TF = True
except ImportError:
    HAS_TF = False
    print("WARNING: tensorflow not installed. Run: pip install tensorflow")

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

EXPORT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "modelos_exportados")
os.makedirs(EXPORT_DIR, exist_ok=True)

TURNOS = ["previa", "primera", "matutina", "vespertina", "nocturna"]
SEQUENCE_LENGTH = 10  # Look back 10 draws


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
        data = r.json() if r.ok else []
        return data
    except:
        return []


def prepare_sequences(draws):
    """Convert draws to sequence format for LSTM/Transformer."""
    all_nums = []
    for d in draws:
        if isinstance(d.get("numbers"), list) and len(d["numbers"]) >= 20:
            nums = [n % 100 for n in d["numbers"]]
            all_nums.append(nums)

    if len(all_nums) < SEQUENCE_LENGTH + 10:
        return None, None

    all_nums.reverse()  # chronological order

    X, y = [], []
    for i in range(SEQUENCE_LENGTH, len(all_nums)):
        seq = all_nums[i - SEQUENCE_LENGTH:i]
        target = all_nums[i]

        # Binary presence vector for each draw in sequence
        features = []
        for draw in seq:
            binary = np.zeros(100)
            for n in draw:
                binary[n] = 1
            features.append(binary)

        X.append(features)

        # Target: binary vector of which numbers appeared
        target_binary = np.zeros(100)
        for n in target:
            target_binary[n] = 1
        y.append(target_binary)

    return np.array(X), np.array(y)


def build_lstm_model():
    """Build LSTM model for sequence prediction."""
    model = tf.keras.Sequential([
        tf.keras.layers.LSTM(128, input_shape=(SEQUENCE_LENGTH, 100), return_sequences=True),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.LSTM(64),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(128, activation='relu'),
        tf.keras.layers.Dense(100, activation='sigmoid')
    ])
    model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
    return model


def build_transformer_model():
    """Build Transformer model for sequence prediction."""
    inputs = tf.keras.layers.Input(shape=(SEQUENCE_LENGTH, 100))

    # Multi-head attention
    attn_output = tf.keras.layers.MultiHeadAttention(
        num_heads=4, key_dim=32
    )(inputs, inputs)
    attn_output = tf.keras.layers.Dropout(0.1)(attn_output)
    x = tf.keras.layers.LayerNormalization()(inputs + attn_output)

    # Feed-forward
    ff = tf.keras.layers.Dense(128, activation='relu')(x)
    ff = tf.keras.layers.Dense(100)(ff)
    ff = tf.keras.layers.Dropout(0.1)(ff)
    x = tf.keras.layers.LayerNormalization()(x + ff)

    # Global pooling + output
    x = tf.keras.layers.GlobalAveragePooling1D()(x)
    x = tf.keras.layers.Dense(64, activation='relu')(x)
    outputs = tf.keras.layers.Dense(100, activation='sigmoid')(x)

    model = tf.keras.Model(inputs, outputs)
    model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
    return model


def build_bnn_model():
    """Build Bayesian-like Neural Network using MC Dropout."""
    model = tf.keras.Sequential([
        tf.keras.layers.Dense(128, input_shape=(SEQUENCE_LENGTH * 100,), activation='relu'),
        tf.keras.layers.Dropout(0.3),  # MC Dropout for Bayesian approximation
        tf.keras.layers.Dense(64, activation='relu'),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(32, activation='relu'),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(100, activation='sigmoid')
    ])
    model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
    return model


def mc_dropout_predict(model, X, n_forward=50):
    """Monte Carlo Dropout prediction for uncertainty estimation."""
    predictions = []
    for _ in range(n_forward):
        pred = model(X, training=True)  # Training=True enables dropout
        predictions.append(pred.numpy())

    stacked = np.stack(predictions)
    mean = stacked.mean(axis=0)
    std = stacked.std(axis=0)

    return mean, std


def train_and_export(turno):
    """Train all 3 models for a turno and export to JSON."""
    if not HAS_TF:
        print(f"  {turno}: TensorFlow not available")
        return

    draws = fetch_draws(turno, 500)
    if len(draws) < 50:
        print(f"  {turno}: insufficient data ({len(draws)} draws)")
        return

    X, y = prepare_sequences(draws)
    if X is None:
        print(f"  {turno}: insufficient sequences")
        return

    print(f"  {turno}: {X.shape[0]} sequences, {X.shape[1]} timesteps")

    # Split train/test
    split = int(len(X) * 0.8)
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    results = {"turno": turno, "n_draws": len(draws), "timestamp": __import__("datetime").datetime.now().isoformat()}

    # === LSTM ===
    print(f"    Training LSTM...")
    lstm = build_lstm_model()
    lstm.fit(X_train, y_train, epochs=30, batch_size=32, validation_data=(X_test, y_test), verbose=0)
    lstm_loss, lstm_acc = lstm.evaluate(X_test, y_test, verbose=0)

    # Get predictions for last sequence
    last_seq = X[-1:].copy()
    lstm_pred = lstm.predict(last_seq, verbose=0)[0]
    lstm_top10 = np.argsort(lstm_pred)[-10:].tolist()

    results["lstm"] = {
        "accuracy": float(lstm_acc),
        "loss": float(lstm_loss),
        "top10": lstm_top10,
        "scores": {str(i): float(lstm_pred[i]) for i in range(100)}
    }

    # Export LSTM weights as JSON
    lstm_weights = {}
    for layer in lstm.layers:
        if hasattr(layer, 'get_weights') and layer.get_weights():
            weights = layer.get_weights()
            lstm_weights[layer.name] = [w.tolist() for w in weights]

    with open(os.path.join(EXPORT_DIR, f"lstm_{turno}.json"), "w") as f:
        json.dump({"weights": lstm_weights, "config": lstm.get_config()}, f)

    # === TRANSFORMER ===
    print(f"    Training Transformer...")
    transformer = build_transformer_model()
    transformer.fit(X_train, y_train, epochs=30, batch_size=32, validation_data=(X_test, y_test), verbose=0)
    trans_loss, trans_acc = transformer.evaluate(X_test, y_test, verbose=0)

    trans_pred = transformer.predict(last_seq, verbose=0)[0]
    trans_top10 = np.argsort(trans_pred)[-10:].tolist()

    results["transformer"] = {
        "accuracy": float(trans_acc),
        "loss": float(trans_loss),
        "top10": trans_top10,
        "scores": {str(i): float(trans_pred[i]) for i in range(100)}
    }

    # === BNN (MC Dropout) ===
    print(f"    Training BNN (MC Dropout)...")
    X_flat = X.reshape(len(X), -1)
    X_test_flat = X_test.reshape(len(X_test), -1)
    last_flat = last_seq.reshape(1, -1)

    bnn = build_bnn_model()
    bnn.fit(X_flat, y_train, epochs=30, batch_size=32, validation_data=(X_test_flat, y_test), verbose=0)

    # MC Dropout prediction
    bnn_mean, bnn_std = mc_dropout_predict(bnn, last_flat, n_forward=50)
    bnn_mean = bnn_mean[0]
    bnn_std = bnn_std[0]
    bnn_top10 = np.argsort(bnn_mean)[-10:].tolist()

    results["bnn"] = {
        "mean_scores": {str(i): float(bnn_mean[i]) for i in range(100)},
        "uncertainty": {str(i): float(bnn_std[i]) for i in range(100)},
        "top10": bnn_top10,
        "avg_uncertainty": float(bnn_std.mean())
    }

    # Ensemble: average of all 3 models
    ensemble_pred = (lstm_pred + trans_pred + bnn_mean) / 3
    ensemble_top10 = np.argsort(ensemble_pred)[-10:].tolist()

    results["ensemble"] = {
        "top10": ensemble_top10,
        "scores": {str(i): float(ensemble_pred[i]) for i in range(100)}
    }

    # Save results
    with open(os.path.join(EXPORT_DIR, f"deep_learning_{turno}.json"), "w") as f:
        json.dump(results, f, indent=2)

    print(f"    LSTM acc: {lstm_acc:.4f}, Transformer acc: {trans_acc:.4f}")
    print(f"    Ensemble top10: {ensemble_top10}")

    return results


def main():
    if not HAS_TF:
        print("ERROR: tensorflow not installed. Run: pip install tensorflow")
        sys.exit(1)

    print("=== Deep Learning Training Pipeline ===")
    print(f"TensorFlow version: {tf.__version__}")

    all_results = {}
    for turno in TURNOS:
        print(f"\nTraining {turno}...")
        result = train_and_export(turno)
        if result:
            all_results[turno] = result

    # Save summary
    with open(os.path.join(EXPORT_DIR, "deep_learning_summary.json"), "w") as f:
        json.dump(all_results, f, indent=2)

    print(f"\nAll models exported to {EXPORT_DIR}")


if __name__ == "__main__":
    main()
