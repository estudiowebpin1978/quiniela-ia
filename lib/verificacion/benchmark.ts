/**
 * Benchmark obligatorio (audit rule: baseline + OOS + lift).
 *
 * El harness REAL es `scripts/oos-eval.ts` (walk-forward, corte temporal
 * estricto sin fuga). Esta interfaz refleja exactamente las métricas que ese
 * script produce (`Agg` + `lift` + `z`) para poder almacenarlas sin inventar
 * campos que nadie calcula.
 *
 * Corrida de referencia documentada: 2026-09-25 (ver lib/probability/calibration.ts):
 *   - Quiniela: n=1314 OOS · Poceada: n=427 OOS
 *   - Veredicto: ningún modelo supera al azar (|z| ≤ 1.8)
 *
 * Regla de honestidad: NO rellenar `lift`/`z` a mano; provienen de una corrida
 * de `oos-eval.ts`. Un lift ≤ 1 o |z| < 1.96 significa que el modelo NO supera
 * al azar de forma significativa.
 */

/** Métricas OOS agregadas por modelo — espejo de `Agg` en scripts/oos-eval.ts */
export interface BenchmarkResult {
  /** Modelo evaluado (nombre exacto del harness) */
  model: string;
  /** Cantidad de sorteos OOS evaluados */
  n: number;
  /** Intersección media top-N vs 2C distinct del sorteo */
  meanHits: number;
  /** P(≥1 acierto) */
  pAtLeast1: number;
  /** P(≥3 aciertos) */
  pAtLeast3: number;
  /** P(ganar) según regla del app (Quiniela P≥1 · Poceada P≥5) */
  pWin: number;
  /** P(cabeza en top-N) */
  cabezaAtTop: number;
  /** Mean reciprocal rank del cabeza */
  mrr: number;
  /** meanHits / esperanza aleatoria (hipergeométrica). 1.0 = azar */
  lift: number;
  /** z-score vs hipergeométrica. |z| ≥ 1.96 = significativo */
  z: number;
}

/**
 * Baselines y modelos que evalúa `oos-eval.ts` (nombres exactos del harness).
 * `random` es el baseline obligatorio; `freq30` = frecuencia; `decay15` =
 * recency; `bayes` = frecuencia+prior; `v7`/`v7_ens` = OMEGA (actual).
 */
export const BASELINES = [
  "random",
  "freq30",
  "decay15",
  "bayes",
  "v7",
  "v7_ens",
  "combo",
] as const;

/**
 * Scaffold: no calcula nada. Indica cómo obtener el benchmark REAL.
 * El cálculo vive en `scripts/oos-eval.ts` (solo lectura, walk-forward).
 */
export function benchmarkScaffold(): {
  note: string;
  baselines: readonly string[];
  harness: string;
} {
  return {
    note:
      "Benchmark real: ejecutar `npx tsx scripts/oos-eval.ts --warmup=60 --step=1`. " +
      "No se rellenan lift/z a mano (regla: no inventar métricas).",
    baselines: BASELINES,
    harness: "scripts/oos-eval.ts",
  };
}

/**
 * Veredicto honesto de un BenchmarkResult contra el azar.
 * NO promueve modelo: solo clasifica la evidencia OOS.
 */
export function verdictVsRandom(r: BenchmarkResult): {
  superaAzar: boolean;
  significativo: boolean;
  texto: string;
} {
  const significativo = Math.abs(r.z) >= 1.96;
  const superaAzar = r.lift > 1;
  let texto: string;
  if (significativo && superaAzar) {
    texto = `Supera al azar de forma significativa (lift=${r.lift.toFixed(3)}, z=${r.z.toFixed(1)})`;
  } else if (significativo && !superaAzar) {
    texto = `Empeora al azar de forma significativa (lift=${r.lift.toFixed(3)}, z=${r.z.toFixed(1)})`;
  } else {
    texto = `Sin ventaja significativa sobre el azar (lift=${r.lift.toFixed(3)}, |z|=${Math.abs(r.z).toFixed(1)} < 1.96)`;
  }
  return { superaAzar, significativo, texto };
}
