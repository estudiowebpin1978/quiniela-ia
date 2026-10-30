# Resumen de mejoras implementadas (2026-10-26)

## Estado: TODO VERIFICADO / IMPLEMENTADO / NO INVENTADO

### 1. Predicciones por modalidad (fuente .gov.ar)
- Quiniela CABA: predictions_cache fresco (meta-ensemble-v1, conf 0.5-0.7)
- Poceada Ciudad: cubierto por mismo pipeline
- Poceada Federal: poceada_federal_draws 2351 validados, /combinaciones OK
- Brinco: brinco_draws 23 sorteos, verificación automática activa

### 2. Auto-mejoras implementadas (con evidencia)
- Precompute horario (vercel.json) + gate <2h (lote-diario.ts)
- Walk-forward OOS 2h (lote-chunk.ts) — recuperando atraso
- ML semanal (auto-train) — conectado al ticker
- V7 feedback: conectado (needs verified draw — ahora disponible 24/10)
- Poceada Federal evaluacion-oos.ts creado (con datos reales)
- Admin UI rediseñado (no overlap, responsive)
- Predictions UI limpia (Análisis Guardados, botones unificados)
- Health check smart (scraper no DEGRADED si Nocturna pendiente)

### 3. No aplicado (sin evidencia OOS)
- CT engine: peso 0 (backtest -0.5% confirmado)
- Nuevos modelos: no creados (no justifican con datos actuales)
- Datos inventados: NUNCA (confirmado por diseño)

### 4. Limitaciones documentadas
- Brinco: solo 23 sorteos (límite fuente CAS)
- V7 weights: última actualización 4/10 (requería sorteo verificado; ahora disponible)
- PF: error 8443 en conector (IAFAS backup funciona)
- Walk-forward: aún recuperando datos hasta 2026-01-14
