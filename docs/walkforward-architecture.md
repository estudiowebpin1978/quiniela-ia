ARQUITECTURA APROBADA PARA WALK-FORWARD REAL

Estrategia híbrida (pragmática para serverless):

1. V6: Llamada real a calculate_omega_v6 SQL RPC (rápido: ~0.9s por turno)
2. V7: Reproducir predictEnsembleV7 (TypeScript, ~1-2s)
3. ML: Reproducir getMLPredictions (TypeScript, ~0.3s)
4. Ensemble: Blend dinámico con weights actuales

Chunking: cada turno = ~350 fechas de test. A ~3s/paso = 1050s. No cabe en 300s.
Solución: 30 fechas por chunk (90s). Estado guardado en walkforward_progress.

Después de completar todos los chunks:
- SELECT turno, engine_name, COUNT(*) AS n, SUM(CASE WHEN is_hit THEN 1 ELSE 0 END) AS hits FROM walkforward_results GROUP BY turno, engine_name
- Hit rate = hits / total
- Near miss rate = SUM(is_near_miss) / total
- Calibración: confidence_score real del RPC vs hit rate observado
