# Meta-selector histórico — Quiniela Ciudad (ex Nacional)

Capa **independiente y aditiva** de evaluación/selección estadística sobre los
motores existentes de la Quiniela de la Ciudad de Buenos Aires. Cumple el
pliego de validación: walk-forward sin fuga temporal, múltiples referencias
aleatorias, corrección por comparaciones múltiples vía permutación + holdout,
y registro honesto de resultados.

## 1. Alcance — qué toca y qué NO

| Toca (aditivo) | NO toca (intacto) |
|---|---|
| `lib/selector/*` (módulo puro nuevo) | OMEGA V6 (SQL RPC) y OMEGA V7 (TS) — firmas sin cambios |
| `lib/__tests__/selector-meta.test.ts` | `predictions_cache`, `mis-predicciones`, `/api/predictions` |
| `scripts/selector-eval.ts` (sólo lectura) | Crons existentes, `walkforward_results`, `engine_performance` |

**Estado del selector: EXPERIMENTAL.** No interviene en ninguna predicción de
producción. Sólo se integraría si una corrida demuestra ventaja con las 3
condiciones y ésta se confirma con datos nuevos posteriores.

## 2. Mapa de módulos (`lib/selector/`)

- **`tipos.ts`** — contratos: `SorteoSelector` (20 números posicionados
  0000-9999), `CandidatoSelector` (puro | motor_existente | inyectado),
  `PesosSelector`, `ResultadoSelector`, `VERSION_SELECTOR`.
- **`candidatos.ts`** — evaluadores puros: `frecuencia` (ventana 30),
  `recencia` (media vida 15), `bayes` (Beta-Binomial), `v7` y `v7_ens`
  (motor existente `engine-v7` con `asOf`, firma intacta) y `combo`
  (rank-promedio bayes+recencia+v7). V6 se inyecta desde el runner.
- **`pesos.ts`** — pesos del ensemble **sólo** con validación cronológica
  interna (dentro del train): estandarización interna + softmax con
  temperatura acotada (β=1.5) + shrinkage al prior uniforme (λ=0.3) +
  clamp [0.05; 0.5]. Muestra < 30 cortes → pesos uniformes + `experimental`.
  `sensibilidadMaxima()` mide el techo de reacción a un outlier.
- **`evaluar.ts`** — métricas por objetivo según el **criterio oficial**
  (`lib/verificacion/criterio.ts`): 2C = cabeza (`numbers[0] % 100`) ∈ top-K;
  3C/4C = pick ∈ cualquiera de los 20 puestos (`MOD(n,1000/10000)`). Ceros
  iniciales conservados. También solape top-K y Spearman para duplicación.
- **`walkforward.ts`** — orquestador: orden cronológico estricto (corte t ve
  sólo `[0..t-1]`), partición train/valid/holdout **antes** de evaluar,
  fusión de rankings (rank-average ponderado, escala-invariante y
  determinista), K=5 referencias aleatorias sembradas, IC 95 %, permutación
  pareada (2000 sign-flips), 4 bloques, veto de holdout y comparación
  meta-vs-mejor-candidato (elegido en validación, medido en holdout).
  Reutiliza `mulberry32`/`permutacionPareada`/`decidirCondiciones` de
  `lib/poceada-federal/backtest.ts` (ya testeados).

## 3. Candidatos y exclusiones (honestidad)

**Evaluados (2C):** frecuencia, recencia, bayes, v7, v7_ens, combo (puros /
motor existente) + **v6** (RPC `calculate_omega_v6` con `p_date` = fecha del
corte → el filtrado `date < p_date` lo garantiza SQL).

**EXCLUIDOS y por qué:**

- **ML (RandomForest+Neural+Markov)** — los modelos de `ml_models` no tienen
  fecha de entrenamiento reproducible por corte: su score podría incorporar
  información posterior al corte evaluado (fuga potencial). No evaluables sin
  fuga ⇒ excluidos, no puntuados.
- **V7/ML sobre candidatos 3/4 cifras** — `predictV7ForCandidates` usa
  `loadPrecomputedStats` (vistas materializadas **sin corte temporal**) y
  `getMLPredictionsForCandidates` depende de los modelos anteriores. Ambos
  fugan ⇒ excluidos del OOS.

**3/4 cifras:** cada modelo produce **su propio top-10** sobre el espacio
completo `0..10^c−1`:

- **v6**: top-10 de `score_numbers_v6` con `p_date` (la RPC devuelve
  exactamente el top-10 ordenado por score — verificado empíricamente;
  anti-fuga nativa).
- **frecuencia** (conteo `MOD(n,10^c)` de la ventana de 30), **recencia**
  (decaimiento, media vida 15) y **bayes** (conteo completo con prior Beta,
  monótono en conteo) — generados con una pasada de conteos por corte, sin
  explorar los 1000/10000 números uno por uno.
- **meta**: `blendGenerico` sobre la unión de los top-10 (V6 puntúa 0 a los
  ausentes — misma semántica que `blendCandidatos` del pipeline); pesos 2C
  renormalizados sobre los 4 motores aplicables.

Referencias: azar **uniforme sobre todo el espacio** (K=5 muestreos
sembrados) y azar **analítico** (`1 − ∏_{i=0..9}(N−20−i)/(N−i)`).
V7/ML quedan excluidos en 3/4C: `predictV7ForCandidates` usa stats
precomputados sin corte temporal y `getMLPredictionsForCandidates` depende de
modelos sin fecha reproducible (fuga).

## 4. Cómo reproducir la corrida

```bash
# Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npx tsx scripts/selector-eval.ts \
  --turnos=Previa,Primera,Matutina,Vespertina,Nocturna \
  --warmup=60 --step=3 --cifras-paso=3 \
  --salida=%TEMP%\selector-eval.json
```

Sólo lectura: consulta `draws` (columna Ciudad) y RPCs de scoring con
`p_date`. No escribe nada en la base.

## 5. Resultados de la corrida real

Corrida del **2026-10-16** (`scripts/selector-eval.ts`, sólo lectura):
warmup 60, **step 1** (210-213 cortes/turno), top-K 10, K=5 referencias
aleatorias sembradas, permutación pareada 2000 sign-flips, holdout ~20 %
(42-43 cortes), validación interna 34 cortes (**pesos ajustados, no
experimentales**). Datos: 270-273 sorteos por turno (2025-11-20 → 2026-10-16),
columna Ciudad.

### 5.1 Dos cifras (objetivo principal: cabeza ∈ top-10)

| Turno | Pesos ajustados (top-3) | Meta vs azar (IC 95 %) | p | Holdout | Meta vs mejor candidato (holdout) |
|---|---|---|---|---|---|
| Previa | v6 0.41 · bayes 0.29 | **−0.152** [−0.319, +0.015] | 0.070 | +0.079 [−0.297, +0.455] | +0.116 vs v6 [−0.154, +0.387] |
| Primera | bayes 0.47 · v6 0.17 · recencia 0.14 | **−0.086** [−0.256, +0.084] | 0.307 | +0.005 [−0.432, +0.442] | +0.024 vs bayes [−0.247, +0.295] |
| Matutina | v6 0.48 · v7_ens 0.13 | **−0.064** [−0.244, +0.116] | 0.478 | −0.229 [−0.582, +0.125] | −0.119 vs v6 [−0.486, +0.248] |
| Vespertina | bayes 0.52 · v6 0.14 | **+0.057** [−0.117, +0.231] | 0.529 | +0.205 [−0.201, +0.611] | +0.095 vs bayes [−0.210, +0.400] |
| Nocturna | combo 0.37 · v6 0.18 · v7 0.18 | **+0.026** [−0.157, +0.208] | 0.787 | −0.191 [−0.537, +0.156] | +0.024 vs combo [−0.256, +0.303] |

**Veredicto 2C: sin ventaja en 0/5 turnos.** Ninguna IC 95 % de meta-vs-azar
excluye el 0 (todas las p ≥ 0,07); el holdout no contradice pero tampoco
apoya; y el meta **no supera al mejor candidato individual** en ningún turno
(todas las IC de esa comparación incluyen el 0). El IC negativo de Previa
(−0,152, p=0,07) es una señal de que el blend ponderado puede estar **por
debajo** del azar en ese turno, no por encima.

Cabeza@10 en holdout (42-43 sorteos; azar teórico = 0,10): los mejores
individuales rondan 0,14-0,21 (bayes 0,209 en Previa; v6 0,190 en Matutina;
v7_ens 0,143 en Nocturna), pero con n=42 estas diferencias NO alcanzan
significancia (mismo veredicto del benchmark histórico del repo: |z| ≤ 1,8).

### 5.2 Tres y cuatro cifras (27 cortes/turno, submuestreo cada 8 sorteos)

Tasa = sorteos con ≥1 acierto entre los 20 puestos (top-10 de cada modelo).
Referencias: azar uniforme K=5 (empírico) y analítico (0,1837 en 3C;
0,0198 en 4C).

| Turno | 3C meta / v6 / ref-azar | meta−azar (IC, p) | 4C meta / ref-azar |
|---|---|---|---|
| Previa | 0.148 / 0.148 / 0.237 | −0.089 [−0.245, +0.067], p=0.31 | 0.037 / 0.037 |
| Primera | 0.185 / 0.037 / 0.163 | +0.022 [−0.133, +0.178], p=0.77 | 0.037 / 0.030 |
| Matutina | 0.148 / 0.148 / 0.230 | −0.082 [−0.240, +0.077], p=0.34 | 0.000 / 0.007 |
| Vespertina | 0.111 / 0.111 / 0.200 | −0.089 [−0.223, +0.046], p=0.18 | 0.000 / 0.007 |
| Nocturna | 0.259 / 0.259 / 0.148 | +0.111 [−0.072, +0.294], p=0.23 | 0.000 / 0.022 |

**Veredicto 3C/4C: sin ventaja.** Ninguna meta-vs-azar-uniforme es
significativa (todas las IC incluyen 0). Los valores puntuales (p. ej.
frecuencia 0,148 en 4C-Matutina con 27 cortes) son ruido a este n; nada
sobrevive a la comparación con la referencia.

### 5.3 Duplicación de señales entre candidatos

- **v7 ~ v7_ens**: solape top-10 0,86-0,87 y Spearman ≈ 0,99 en los 5 turnos
  → son prácticamente **el mismo modelo**; darles pesos separados infla la
  aparente diversidad sin aportar información nueva.
- **frecuencia ~ recencia**: solape 0,65-0,71 (ρ ≈ 0,88) — esperado: ambas
  señales son conteos con distinta ventana/decaimiento.
- **bayes ~ combo**: solape 0,53-0,58 — combo contiene a bayes por
  construcción (es uno de sus tres rankings).

### 5.4 Conclusión

Con ~210 evaluaciones por turno y el protocolo completo (IC + permutación +
holdout + comparación contra el mejor individual), **el meta-selector NO
demuestra ventaja predictiva en ningún turno, en 2, 3 ni 4 cifras**. Los
pesos ajustados varían fuertemente entre turnos (v6 domina en Previa/
Matutina; bayes en Primera/Vespertina; combo en Nocturna) — inestabilidad
consistente con la ausencia de señal diferencial robusta. El selector queda
**EXPERIMENTAL y fuera de producción**, tal como exige el pliego cuando la
evidencia no alcanza.

## 6. Limitaciones (todas vigentes)

1. **Reconstrucción retrospectiva**: las evaluaciones se generan hoy con
   motores actuales; no equivalen a predicciones registradas pre-sorteo
   (esas viven en `engine_predictions_log` desde 2026-10-03).
2. **Dependencia temporal**: los cortes walk-forward se solapan en datos
   (ventanas expansivas) → IC y p-valores son aproximados/optimistas.
3. **Comparaciones múltiples**: varios candidatos y parámetros evaluados; la
   permutación controla la comparación principal (meta vs azar), pero la
   selección del "mejor candidato" no tiene corrección formal de Bonferroni.
4. **Sin ML**: el sub-modelo RandomForest/Neuronal/Markov queda fuera hasta
   que exista un artefacto de modelo con fecha de entrenamiento reproducible.
5. **Histórico limitado**: `draws` conserva ~2000 filas (retención de la
   tabla) ⇒ ~250-330 sorteos por turno.
