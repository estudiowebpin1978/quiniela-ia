ESTADO WALK-FORWARD BACKTEST REAL (prioridad #1)

IMPLEMENTADO:
- Tablas SQL: public.walkforward_results, public.walkforward_progress
- Endpoint: /api/walkforward-backtest (GET, chunked por turno, auth cron)
- Replay V6 REAL: para cada fecha T (test) usa solo draws con date < T como contexto de entrenamiento, llama calculate_omega_v6(p_tier='free'), compara top 10 con el draw real en T, guarda: turno, test_date, engine_name='V6', predicted_numbers[] (top 10), actual_numbers[] (draw real), is_hit, is_near_miss
- Chunking: 30 fechas por invocación dentro de 300s
- Progreso persistente: walkforward_progress guarda last_processed_date + status por turno
- Error handling robusto con JSON.stringify(e) en lugar de String(e) (evita "[object Object]")
- Fix: public.predictions_cache_upsert + public.engine_predictions_log_upsert wrappers creados (el backtest fallaba porque supabase.rpc() busca funciones en schema public por defecto)

FALTANTE (tu roadmap puntos #2-#16):
- V7 replay real: requiere importar predictEnsembleV7 + loadV7Weights en endpoint
- ML replay real: requiere importar getMLPredictions + cargar modelos de ml_models por turno
- Ensemble blend dinámico: usar loadEngineWeightsDecayed con datos históricos por turno
- Validación Pattern (quitar si backtest no aporta)
- Colinealidad frecuencia/hot/trend: medir correlación entre scores
- Gap: validar si aporta sobre frecuencia + hot
- Markov orden 2: comparar orden 1 vs 2
- 3/4 cifras: extender score_numbers_v6 al replay (ya funciona, se puede guardar por cifras separadas)
- Redoblona avanzada: pair_frequency + conditional + recency
- Calibración: confidence real vs hit rate observado
- Meta-diversidad: penalizar concentración de candidatos
- Meta-model stacking: aprender blend óptimo en lugar de pesos fijos
- Anti-overfitting: "Regla Omega" (ninguna técnica entra sin demostrar mejora OOS)

ARQUITECTURA FINAL PROPUESTA (del roadmap):
                   HISTORIAL (draws table)
                      |
          +-----------+-----------+
          |           |           |
         7d         30d        90d  (windows por turno)
          |           |           |
          +-----------+-----------+
                      |
                 FEATURE ENGINE
          (V6 SQL + V7 TS + ML models)
                      |
                 META ENSEMBLE
            (blend dinámico con decay + calibración)
                      |
                 DIVERSIDAD CHECK
                      |
              +-------+-------+
              |               |
           2 CIFRAS      3/4 CIFRAS (score_numbers_v6)
              |               |
              +-------+-------+
                      |
                  REDOBLONA (pair scoring avanzado)
                      |
                      |
                 WALKFORWARD BACKTEST
                      (por turno, por motor, OOS)
                      |
                 OPTIMIZADOR
          (colinealidad + factor elimination)
                      |
                 PREDICCIONES FINALES
                      |
                 SORTEO REAL
                      |
                 VERIFICACIÓN
                      |
                 ENGINE PERFORMANCE UPDATE
