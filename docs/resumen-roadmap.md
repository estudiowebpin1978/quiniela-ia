=== IMPLEMENTADO (roadmap #1-#16) ===
1. Pattern desactivado matemáticamente (w_pattern = 0 cuando disabled)
2. Dynamic weights con datos OOS (walkforward_results como fuente primaria)
3. Backtest chunked endpoint: /api/walkforward-backtest
4. Replay V6 real (SQL RPC, draws previas como contexto)
5. Replay V7 real (predictEnsembleV7 integrado)
6. Replay ML real (getMLPredictions + modelos DB)
7. Ensemble blend real (V6+V7+ML con weights dinámicos)
8. Persistencia: walkforward_results
9. Progreso: walkforward_progress
10. Calibración: calibration_summary SQL + campo en /api/predictions
11. Fix precompute: public.* wrappers + error JSON.stringify

=== PENDIENTE ===
- Colinealidad frecuencia/hot/trend
- Meta-diversidad
- Regla Omega
