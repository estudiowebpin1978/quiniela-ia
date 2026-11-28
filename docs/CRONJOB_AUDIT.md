# AUDIT_PROGRESS — Quiniela IA

**Fecha:** 2026-11-11 · **alias:** https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev/ ·
**Commit desplegado:** `50c1684` (cron-scrape 267 líneas → deploy-exit=0)

## Estado de Cron-job.org (verificado en vivo)

| ID | Título | URL | Frecuencia | lastStatus | lastExec |
|---|---|---|---|---|---|
| 8298680 | Quiniela IA - Push Notifications | `/api/cron-push` | Cada 15 min | 1 (OK) | 22:00 |
| 8150173 | Quiniela IA - Scraping | `/api/cron-scrape` | Cada 15 min (L–S) | 1 (OK) | 22:00 |
| 8835312 | Quiniela IA - Verify catchup | `/api/cron-verify-catchup` | 09:00 ART | 1 (OK) | 09:00 |
| 8504281 | verificacion | `/api/cron-verify-predictions` | Cada 5 min | 1 (OK) | 22:05 |

**Jobs eliminados (refactor free 2026-11-28):** se dieron de baja los jobs
`8845214` (Brinco sync) y `8845223` (Poceada Federal sync). Sus endpoints ya no
existen — **borrarlos también en cron-job.org** si siguen listados.

## Estado Omega y backtest

Vuelte verificación módulo 100. Resultados guardados (sumas originales) contienen el bug:

```
ENSEMBLE/Matutina   T=  34 hits=   0 rate=0.0%
Nocturna            T=  60 hits=   1 rate=1.7%
Previa              T=  85 hits=   2 rate=2.4%
V7                  T=  95 hits=   0 rate=0.0%   ← peor que azar
```

**Baseline aleatorio vs predicción a 10 elegidos con 20 ganadores:**
`P(al menos 1 acierto) = 1 - C(80,10)/C(100,10) ≈ 90.49%`

**Causa bug:** predicciones son 2 cifras (00-99) comparadas a números oficiales 0000-9999. El engine predicted_2cifras son las 2 últimas cifras — pero walkforward_results guardaba `actual_numbers` tal cual → nunca coincidían.

**Fix:** `lib/walkforward/lote-chunk.ts` ahora reduce módulo 100. El replay OOS volverá a calcular hits correctamente.

**Migración honesta pendiente (APPLY_MANUALLY):**
`supabase/migrations/APPLY_MANUALLY_omega_rule_honest_baseline.sql`
contiene `CREATE OR REPLACE FUNCTION omega_rule_validation()` con:
- Baseline real 90.49% como umbral ≈ 92%
- Mensaje sin eufemismos: _"ninguna técnica entra sin demostrar mejora OOS"_
- Sin JOIN absurdo con `engine_performance`

**Aplicar manualmente vía Supabase Dashboard → SQL Editor** (no puedo ejecutar SQL directamente desde acá sin credenciales de conexión a PostgreSQL directo).

## Estado de modalidades (verificado en vivo)

| Modalidad | Último sorteo | Falencias | Acción |
|---|---|---|---|
| Quiniela Ciudad (Previa/Primera/Matutina/Vespertina/Nocturna) | 2026-11-11 (Previa, Primera, Matutina, Vespert) | ninguna | OK |

## Pendientes ordenadas

1. **[CRÍTICO]** Aplicar `supabase/migrations/APPLY_MANUALLY_omega_rule_honest_baseline.sql` en Supabase Dashboard → SQL Editor.
2. **[PENDIENTE]** Asistente IA en `/rendimiento` — requiere aprobación humana de free→premium y CAN I verify usuarios nuevos.

