from flask import Flask, jsonify
from ia.predictor import calcular_prediccion

app = Flask(__name__)

@app.route("/prediccion")
def prediccion():
    return jsonify({
        "numeros": calcular_prediccion()
    })

if __name__ == "__main__":
    app.run()