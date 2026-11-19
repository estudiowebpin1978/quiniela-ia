# Plan Operativo de 5 Redoblonas — Walk-Forward OOS (réplica exacta de producción)

Fecha: 2026-11-18 · Fuente: walkforward_results (folds replay vs draws oficiales mod-100)
Folds válidos: 6116 (ENSEMBLE + V6 + V7 + ML)

| Motor | Folds | Pares completos prom. | P(≥1) | P(≥2) | P(≥3) |
|---|---|---|---|---|---|
| V6 | 1562 | 1.172 | 30.73% [28.4–33.0%] | 25.22% | 22.86% |
| V7 | 1568 | 0.115 | 8.04% [6.7–9.4%] | 2.87% | 0.57% |
| ML | 1418 | 0.853 | 27.57% [25.2–29.9%] | 21.79% | 18.34% |
| ENSEMBLE | 1568 | 0.911 | 31.44% [29.1–33.7%] | 25.06% | 21.17% |

## Agregado conjunto (todos los motores)
- Folds válidos: **6116**
- Pares completos promedio por fold: **0.760** (placebo 0.153)
- Distribución (0→5 completos): 4626 · 349 · 183 · 428 · 0 · 530
- **P(≥1) modelo: 24.36%**  [IC 95% 0.233–0.254]
- **P(≥1) placebo (anchors aleatorios): 10.34%**  (489280 muestras aleatorias, semilla determinista)
- Diferencia: 14.03 puntos sobre el placebo (folds no independientes — no usar como p-value; ver sección siguiente)

## Conclusión honesta

El plan completo, con los anchors que el motor realmente elige (replay OOS, no simulación), supera al placebo (0.760 vs 0.153 pares/fold; P(≥1) 24.36% vs 10.34%). Ese lift proviene de números calientes (los motores eligen números con mayor tasa de aparición; cada premio sale ≈20% de las veces): 
cualquier conjunto de 4 números sobrepresentes lo reproduce. El mismo cálculo aplicado a V7 (sin efecto dominante de frecuencia) da 0.115 pares/fold, por debajo del placebo: confirma que el beneficio no proviene de la estructura del plan sino de la selección de números del motor. Esta evidencia es descriptiva, no causal; los folds no son independientes (1/turno/fecha); y NO mide EV monetario (LOTBA es pari-mutuel: el pozo se divide entre ganadores). El plan entrega estructura y disciplina, no ventaja matemática.