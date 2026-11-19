# OMEGA Statistical Research — veredicto honesto (2026-11-18)

Principia estricta cumplida: **no se promovió ningún modelo nuevo**, no se
alteró el motor congelado, no se inventó ni infló ninguna señal.
Conclusión global: **NO STATISTICALLY VERIFIED PREDICTIVE ADVANTAGE**.
El baseline uniforme sigue siendo el límite superior verificable.

---

## 1. Distribución teórica por juego

| Juego | Universo | Premios | P(par específico en 20) | P(número específico) |
|---|---|---|---|---|
| Quiniela Ciudad (ex Nacional) | 00-99 (2C), 000-999 (3C), 0000-9999 (4C) | 20 | C(80,2)/C(100,2)→(20·19)/(100·99) ≈ 3.84% | 20/100 = 0.2 |
| Poceada Ciudad | 00-99 | 20 (solo 2C) | ídem | 0.2 |
| Poceada Federal (Sta Fe) | 00-99 | 20 (solo 2C) | ídem | 0.2 |
| Brinco (Sta Fe) | 00-39 | 6 | C(34,6)/C(40,6)→(6·5)/(40·39) ≈ 1.92% | 6/40 = 0.15 |

Estrategia base teórica: número específico 20%; pareja específica 3.84%.

## 2. Censo real por juego (CABA|Ciudad, al 2026-11-18)

| Juego/turno | Sorteos | Desde | Hasta |
|---|---|---|---|
| Previa | 301 | 2025-11-20 | 2026-11-18 |
| Primera | 151 | 2025-11-20 | 2026-11-18 |
| Matutina | 299 | 2025-11-20 | 2026-11-18 |
| Vespertina | 299 | 2025-11-20 | 2026-11-18 |
| Nocturna | 160 | 2025-11-20 | 2026-11-18 |
| Poceada | 301 | 2025-11-20 | 2026-11-18 |
| Poceada Federal (validated) | 2393 | 2021-06-22 | 2026-11-17 |
| Brinco | 30 | — | — |

## 3. Auditoría de aleatoriedad (Fase 3) — resultados medidos

Pruebas por turno sobre el histórico oficial (in-sample, honesto).
Los tests de orden sobre secuencias intercaladas se ejecutan con un
barajado DETERMINISTA GLOBAL de la secuencia (el guardado almacena
sorteos ordenados ascendentemente — artefacto de formato, no señal).

| Turno | χ² 2C (p) | χ² %10 (p) | Runs z | L-Box Q20 (p) | Entropía bits |
|---|---|---|---|---|---|
| Previa | 78.1 (0.940) | 12.3 (0.196) | +0.27 | 16.5 (0.684) | 6.634/6.644 |
| Primera | 106.7 (0.281) | 11.6 (0.238) | −1.27 | 25.8 (0.173) | 6.619/6.644 |
| Matutina | 86.8 (0.804) | 5.4 (0.799) | +1.00 | 16.0 (0.719) | 6.633/6.644 |
| Vespertina | 123.9 (0.046) | 3.1 (0.961) | +0.46 | 14.8 (0.790) | 6.629/6.644 |
| Nocturna | 88.2 (0.774) | 4.9 (0.841) | −0.56 | 7.6 (0.994) | 6.624/6.644 |
| Poceada | 59.9 (0.999) | 5.0 (0.832) | +1.68 | 22.6 (0.308) | 6.637/6.644 |

Notas pivotes:
- **Vespertina χ² = 0.046** — no supera Bonferroni (α = 0.05/42 = 1.19e-3). Nada.
- **Poceada: todos los tests normales** tras corrección por formato (el sierra era
  100% formato: Q20 ≈ 71k sin barajar; con barajado global, 22.6 y p=0.308).
- **Bonferroni**: 42 tests → α = 1.19e-3. 0 supervivientes.
- Poceada Ciudad tiene **orden de extracción perdido** (guardado ascend) → para
  cualquier auditoría posicional posterior se requiere preservarlo desde el scraper.

### Poceada Federal (Sta Fe/Entre Ríos) — auditoría con n = 2,393 sorteos

| Sub-muestra (sorteos) | χ² 2C (p) | χ² %10 (p) | Runs z | L-Box Q20 (p) | Entropía |
|---|---|---|---|---|---|
| Todos (n=2,393 / 47,860 #) | 125.5 (0.037) | 7.2 (0.622) | +0.79 | 17.8 (0.598) | 6.642 |
| Sólo 15:00 (n=750 / 15,000 #) | 123.2 (0.050) | 14.0 (0.123) | −0.89 | 26.6 (0.146) | 6.638 |
| Sólo 21:00 (n=1,643 / 32,860 #) | 94.0 (0.622) | 6.3 (0.710) | −1.00 | 17.6 (0.617) | 6.642 |
| Últimos 400 (n=400 / 8,000 #) | 83.8 (0.863) | 3.4 (0.946) | +0.75 | 22.9 (0.293) | 6.636 |

Bonferroni sobre 24 tests: α = 2.08e-3 → 0 supervivientes. Sólo síntoma no
corregido registrado: χ²_todos p=0.037 (ruido completamente plausible — la
peor actitud $"baja por todos lados"$ no distingue z PAS/ENTRE-RIOS por la
alternancia mensual en el nocturno — no resiste corrección múltiple).

## 4. Desviaciones detectadas

Ninguna sobrevive corrección múltiple con separabilidad turno×juego.
No hay diferencias detectables entre 15:00 y 21:00 en Poceada Federal.
Vespertina es la única frontera (p=0.046, 2.9σ sin corrección) — ruido
bien corregido. Ninguna desviación replicante cross-temporada.

## 5. Factores útiles

Ninguno con ventaja demostrable OOS. El modelo de ranking existente usa
20 factores; la fracción que aporta alguna cosa es la frecuencia histórica
(suavizada arbitrariamente por regularización). 9 de esos factores son
redundantes de uno u otro de los dos tipos básicos `frecuencia` y `atraso`.

## 6. Factores redundantes

Todos los factores derivados de frecuencia/atraso/markov son k-means
geometrically dependientes; la rotación surte el mismo ranking en la
práctica. No hay razón para agregar factores adicionales.

## 7. Comparación de modelos (Walk-forward, folds ≥ 80/turno)

| Modelo | Folds (Previa/Matutina/Nocturna) | P(≥1) modelo | Placebo | Diff |
|---|---|---|---|---|
| **Plan 5 blinda few** | 1562/1418/1568 | V6 30.7% / ML 27.6% / ENS 31.4% | 10.34% | +14.0pts* |
| **Redobona Bayesiana** (λ=0.004, prior=250) | 151/150/80 | 15.23/10.00/3.75% | 8.94/11.58/9.22% | +6.3/−1.6/−5.5 |
| **Redobona Bayesiana** грid | 151/150/80 | ver tablas | — | ningún signo estable |

*Fuente: `walkforward_results` (6,272 folds reales replay vs draws mod-100).

Interpretación crítica del plan5: el lift aparece en V6/ML/ENS y está
ausente en V7 (8.04% vs placebo 10.34%). El lift proviene de sesgo a
*números calientes*, no de la estructura del plan. No es ventaja del plan.

## 8. Métricas OOS

- Poceada/catalog: ninguna métrica supera al placebo de forma consistente.
- Brinco: backtest OOS de `plan5` con solo 30 sorteos → potencia nula
  (muestra insuficiente para significancia).
- Poceada Federal: backtest `pf-combinaciones-1.0.0` ya publicado: dif
  modelo−azar = −0.0048 (IC95% [−0.138, +0.129]) → sin ventaja (ref.
  walkforward_results N=117).
- Redoblona Bayesiana: diff by turno { +6.29, +5.66, −0.33, +2.38, −7.01, −0.95 }
  → sin patrón reproducible; sign inversion cross-turno.

## 9. Significancia y corrección múltiple

- 42 tests (aleatoriedad) → ninguno Bonferroni-significativo.
- 6 turnos × 2 modelos = 12 comparaciones candidatas → ninguna
  significativa bajo α = 0.05/12 = 4.17e-3.
- V6 domina por frecuencia (no por cruce); V7 bajo azar.

## 10. Calibración

Brier scores de la mayoría de las probabilidades son penalizadas por
inconsistencia (≈0.019 flat, azar-level). Ningún modelo calibra más
respecto del azar.

## 11. Mejor configuración

La actual: V6 + V7 + ML + Ensemble, sin promoción ninguna (apropiada).
Prior de la Redoblona Bayesiana: con datos planos cualquier prior
250–400 entrega la misma media posterior ≈ base ↦ prior strong es ociosa.

**Regla de gobierno**: según `omega_rule_validation()`, los 6,164 rows de
auditoría en `omega_promotion_audit` ninguno promovió. Replicado en esta
corrida: ningún candidato demostró mejora OOS y significativa.

## 12. Limitaciones estadísticas

- **Muestra pequeña** post-2025-11-20: 151–301 sorteos por turno;
  la potencia para detectar efectos pequeños es baja.
- **Poceada perdió orden de extracción**; análisis textual imposible
  sin cambio de guardado (probable acción pendiente de auditoría futura).
- **P-values en replay**: señal V6 es correlacionada por construcción
  (same fold in hundreds of results); no ha de interpretarse como causalidad.
- Brinco N=30: potencia nula para cualquier claim.
- FEED: no se pudo probar correlación entre turnos (datos
  limitados/desbalanceados); correrlas requeriría ampliar la base.

---

**Decisión**: mantener producción como está (motor congelado).
Documentar `NO STATISTICALLY VERIFIED PREDICTIVE ADVANTAGE.`

**Accidente corregido aquí**: la Poceada Ciudad almacena sorteos ordenados
ascendentemente — no es un bug; es el formato de guardado. Pero impide
cualquier análisis de orden posicional/autocorrelación.
