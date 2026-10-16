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

<!-- RESULTADOS:PENDIENTE se completa con la corrida del 2026-10-16 -->

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
