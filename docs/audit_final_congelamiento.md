=== AUDITORÍA FINAL CONGELAMIENTO (Regla Omega + No Complejidad + Reproducibilidad) ===

1. FUENTE ÚNICA DE VERDAD
- predictions_cache (predicciones finales)
- draws (sorteos oficiales)
- engine_performance (rendimiento acumulado)
- walkforward_results (replay OOS real)
- omega_promotion_audit (promoción/rechazo)
- calibration_summary (calibración)
- factor_collinearity_advanced (colinealidad)

2. CONSISTENCIA ENGINE
- predictions_cache guarda resultados de V6
- cron-precompute usa calculate_omega_v6 → predictions_cache
- replay V7/ML/Ensemble almacenado en walkforward_results
- weights dinámicos (loadEngineWeightsDecayed) usan datos OOS como fuente primaria

3. HISTORIAL CONSISTENTE
- historical_cutoff = draws previos a fecha de predicción (date < p_date)
- walkforward_results usa solo draws con date < test_date
- No leakage en weights ni calibración

4. NO DATA LEAKAGE
- weights: datos OOS (walkforward_results) solo
- calibration: predictions_cache con fecha < current
- predictions: datos previos como contexto (draws previos)
- engine_performance: actualizado con datos verificados, no futuros

5. REPRODUCIBILIDAD
- V6 SQL (STABLE, determinista)
- V7 TypeScript (determinista, sin perturbación aleatoria excepto diversidad determinista basada en hash)
- ML (determinista, carga modelos serializados)
- Replay determinista (mismo turno+fecha = mismo resultado)
- MMR determinista (hash determinista para dispersión)

6. CALIBRACIÓN
- calibration_summary: usa datos OOS (predictions_cache filtrado por turno + replay)
- No convierte score arbitrariamente en probabilidad
- Separación clara entre score, ranking, calibración

7. CORRELACIÓN
- factor_collinearity_advanced mide aproximación de correlación con datos disponibles (predictions_cache + referencia a replay)
- Detecta alta colinealidad (r > 0.85)
- Recomendación documentada sin eliminación automática

8. DIVERSIDAD MMR
- diversityRatio calculado en cron-precompute
- MMR determinista aplicado si ratio < 0.05
- No usa random()
- No modifica arbitrariamente candidatos
- Evaluación pendiente de mejora real (pendiente según tu análisis)

9. WEIGHTS
- loadEngineWeightsDecayed usa datos OOS como fuente primaria
- Engine_performance como fallback con decaída exponencial
- Nunca etiqueta FALLBACK como optimizado
- Documentado cuando usa cada fuente

10. OMEGA RULE / PROMOTION GATE
- omega_rule_validation: verifica umbral mínimo OOS
- register_omega_promotion: registra auditoría completa
- omega_promotion_audit: guarda old_version, new_version, metrics_before/after, weights_before/after, calibration_before/after, decision, reason, promoted_at
- Promotion gate en cron-precompute: APPROVED/REJECTED con verificación automática
- No reemplaza CURRENT_MODEL si candidato falla
- Nunca deja current_model = NULL
- Regla Omega: técnica solo permanece si demuestra mejora OOS (aún pendiente evaluación completa con datos acumulados del replay)

11. ENGINE ACTUAL / MODELO ACTUAL
- engine_version = meta-ensemble-v1
- weights dinámicos por turno (documentados en p_numeros_2 factor_attribution + engine_weights)
- historical_cutoff = fecha del draw anterior
- calibration activa en /api/predictions (campo calibration)
- predictions_cache guarda datos consistentes con replay

12. AUTOPILOT
- cron-autopilot escribe en predictions_cache
- usa predictions_cache como fuente de datos
- predicciones generadas ~1 hora antes del turno (según cron schedule)
- premium tier = 3 cifras + 4 cifras + redoblona visibles

13. FREEZE / BASELINE
- Modelo congelado para evaluación continua (según criterio final)
- No agregar nuevos factores ni motores
- Cualquier cambio requiere nueva evaluación OOS
- Baseline documentado: meta-ensemble-v1, weights dinámicos, MMR determinista, Pattern desactivado, calibración activa, backtest real

PENDIENTE (no críticos para funcionamiento, según criterio final):
- Evaluación completa con datos completos del replay (más allá de aproximación actual con predictions_cache) para correlación más precisa
- Optimización completa de meta-diversidad con ranking diversificado y evaluación profunda
- Integración automática de Regla Omega como bloqueo absoluto en pipeline deploy (actualmente verificación + auditoría; bloqueo manual documentado)
- Evaluación final de estabilidad con datos acumulados completos del replay

Estado final: sistema reproducible, determinista, auditable, con replay OOS real, calibración activa, diversificación determinista, promotion gate real y congelamiento documentado.
