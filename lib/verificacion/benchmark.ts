/**
 * Benchmark obligatorio (audit rule: baseline + OOS + lift).
 * No ejecuta entrenamiento; define métricas que deben medir los modelos existentes.
 * Fase 1 — scaffold; datos de LOTBA (prediction_history) requeridos para calcular.
 */
export interface BenchmarkResult {
  model: string;
  hitAt1: number;
  hitAt3: number;
  hitAt10: number;
  exactHit: number;
  nearMiss1: number;
  brierScore: number; // requiere calibración real
  liftVsRandom: number;
}

export const BASELINES = ["random", "frequency", "recency", "omega_v6"] as const;

export function benchmarkScaffold(): { note: string; baselines: typeof BASELINES } {
  return {
    note: "SCaffold de benchmark. Requiere datos reales de prediction_history para calcular Hit@N, Brier, lift.",
    baselines: BASELINES,
  };
}
