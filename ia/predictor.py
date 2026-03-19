import pandas as pd
import numpy as np
import random

def cargar_datos():
    df = pd.read_csv("data/historial.csv")
    todos = []

    for fila in df["numeros"]:
        nums = fila.strip("[]").split(",")
        for n in nums:
            try:
                todos.append(int(n))
            except:
                pass

    return pd.Series(todos)

def calcular_prediccion():
    serie = cargar_datos()

    frecuencia = serie.value_counts()
    
    # Normalizar frecuencia
    prob = frecuencia / frecuencia.sum()

    # Penalizar números recientes (atrasados)
    ultimos = serie.tail(100).value_counts()
    
    for num in prob.index:
        if num in ultimos:
            prob[num] *= 0.7  # penaliza si salió hace poco

    prob = prob / prob.sum()

    # Elegir números ponderados
    numeros = np.random.choice(
        prob.index,
        size=5,
        replace=False,
        p=prob.values
    )

    return sorted(numeros.tolist())

if __name__ == "__main__":
    print("Predicción IA:", calcular_prediccion())