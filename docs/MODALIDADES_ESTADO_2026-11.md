# Estado por modalidad — Quiniela IA (2026-11-18)

Veredicto después de auditoría completa. Ninguno de los motores demostrará
ventaja sobre el azar en OOS (y V7 incluso está por debajo del ensemble en
algunas áreas, aunque por encima en dos turnos específicos — ruido estadístico).

## Tabla OOS por turno y motor (walkforward_results, draws mod-100)

| Turno | Engine | Folds | Hit% [IC95 %%] | Mejor elección |
|---|---|---|---|---|
| Previa | V6 | 420 | 52.1 [47.4–56.9] | V6 / ML ≈ (empate plausible) |
| Previa | V7 | 420 | 50.0 [45.2–54.8] | — |
| Previa | ML | 420 | 51.9 [47.1–56.7] | — |
| Previa | ENSEMBLE | 420 | 50.5 [45.7–55.3] | — |
| Primera | V6 | 211 | 55.0 [48.3–61.7] | **ENSEMBLE** |
| Primera | V7 | 211 | 46.4 [39.7–53.2] | — |
| Primera | ML | 211 | 55.5 [48.7–62.2] | — |
| Primera | ENSEMBLE | 211 | **59.7 [53.1–66.3]** | ← mejor de la serie |
| Matutina | V6 | 359 | 46.5 [41.4–51.7] | **V7** (ruido, sin soporte) |
| Matutina | V7 | 359 | 50.1 [45.0–55.3] | — |
| Matutina | ML | 359 | 39.6 [34.5–44.6] | — |
| Matutina | ENSEMBLE | 359 | 48.5 [43.3–53.6] | — |
| Vespertina | V6 | 359 | 56.8 [51.7–61.9] | **ENSEMBLE** |
| Vespertina | V7 | 359 | 40.9 [35.9–46.0] | — |
| Vespertina | ML | 359 | 55.7 [50.6–60.8] | — |
| Vespertina | ENSEMBLE | 359 | **59.9 [54.8–65.0]** | ← mejor de la serie |
| Nocturna | V6 | 220 | 42.7 [36.2–49.3] | **V7** (ruido, sin soporte) |
| Nocturna | V7 | 220 | 50.0 [43.4–56.6] | — |
| Nocturna | ML | 220 | 37.7 [31.3–44.1] | — |
| Nocturna | ENSEMBLE | 220 | 44.1 [37.5–50.7] | — |
| — | V6 global | 1,569 | 51.0 [48.5–53.5] | — |
| — | V7 global | 1,569 | 47.5 [45.0–50.0] | — |
| — | ML global | 1,569 | 48.4 [46.0–50.9] | — |
| — | ENSEMBLE global | 1,569 | **52.5 [50.0–55.0]** | ← mejor global |

## Observaciones críticas (honestas)

1. **Per-modalidad winner per turno** (`V6 / V7 top-score`) es un artefacto de
   la técnica: escoger el modelo que ganó en esta muestra = sobreajuste a ruido
   (ICs amplios, sin significancia vs comparación múltiple). No se permuta motor por turno.
2. **ENSEMBLE global es robusto** (primero en 2/5 turnos, segundo en 1):
   es la mejor elección de sistema sin asumir nada que no sea evidencia.
3. **Azar (top-10 vs 20 mod-100) ≈ 90.49%** — todos los motores están por debajo.
   Esto no es un error de cálculo: es la realidad del régimen.
4. **Poceada Federal**: `pf-combinaciones-1.0.0` OOS ≈ baseline (Dif. −0.0048 IC95
   [−0.138, +0.129]). Sin ventaja. Mantener configuración actual.
5. **Brinco**: 30 sorteos — potencia nula. Mantener marca honesta.
6. **Redoblonas (Polda 5)**: viable como análisis
   de estadísticas históricas, no como predictor.
7. **Poceada Ciudad**: 2 combos (20 posiciones cacheado), sin ventaja OOS.
   Chis-q uniform — ninguna desviación detectable.

## Recomendación de promoción por turno

Promover cambios por turno constituye overgrid a ruido. Los conflictos
que aparecen (V7 gana Nocturna/Matutina en esta muestra sin soporte IC)
no justifican tocar pesos → el ensemble representa el máximo honest-out
disponible en este momento. **NO se modifican pesos.**

## Siguientes pasos realmente útiles

1. **Más datos**: replay (walkforward) de más sorteos históricos (>2024) para
   cerrar intervalos IC.
2. **No asumir señal inexistente**: continuar con prior uniforme; marca honest
   label siempre activo; sin promoción sin OOS.
3. **Datos fresco**: sync on-demand (R1) ya está en prod y Brinco
   (extracto oficial) mantiene historial vivo y verificaciones.
