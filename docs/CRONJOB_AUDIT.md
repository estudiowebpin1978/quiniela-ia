# AUDIT_PROGRESS — Quiniela IA

**Fecha:** 2026-11-11 · **alias:** https://quiniela-ia-two.vercel.app/ ·
**Commit desplegado:** `50c1684` (cron-scrape 267 líneas → deploy-exit=0)

## Estado de Cron-job.org (verificado en vivo)

| ID | Título | URL | Frecuencia | lastStatus | lastExec |
|---|---|---|---|---|---|
| 8298680 | Quiniela IA - Push Notifications | `/api/cron-push` | Cada 15 min | 1 (OK) | 22:00 |
| 8150173 | Quiniela IA - Scraping | `/api/cron-scrape` | Cada 15 min (L–S) | 1 (OK) | 22:00 |
| 8835312 | Quiniela IA - Verify catchup | `/api/cron-verify-catchup` | 09:00 ART | 1 (OK) | 09:00 |
| 8504281 | verificacion | `/api/cron-verify-predictions` | Cada 5 min | 1 (OK) | 22:05 |
| **8845214** | **Quiniela IA - Brinco sync** | `/api/cron-brinco` | Domingos 22:30 ART | — | sin ejecutar aún |
| **8845223** | **Quiniela IA - Poceada Federal sync** | `/api/cron-poceada-federal` | Diario 22:30 ART | — | prx: 2026-11-11 22:30 |

**Nota sobre Brinco:** vence **2027-11-11** — volver a actualizar la fecha antes del vencimiento.

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
| Poceada Ciudad | 2026-11-10 (source lotba-oficial) | Ninguna — 20 números | OK, cache fresca hoy |
| Brinco | 2026-10-25 (concurso 1377) | Ninguna — 24 sorteos cargados | Tabla en regla |
| Poceada Federal | 2026-11-10 (concurso 5779) | Ninguna — 2381 validados | OK, 2443 sorteos en DB |

## Pendientes ordenadas

1. **[CRÍTICO]** Aplicar `supabase/migrations/APPLY_MANUALLY_omega_rule_honest_baseline.sql` en Supabase Dashboard → SQL Editor.
2. **[RECOMENDADO]** Verificar el próximo cron `cron-brinco` (2026-11-16 22:30) — primera corrida tras activación.
3. **[OPCIONAL]** Ejecutar un set de backtests re-fetch automáticos vía Supabase `cron-poceada-federal` para que el replay corrija hits con el fix nuevo.
4. **[PENDIENTE]** Asistente IA en `/rendimiento` — requiere aprobación humana de free→premium y CAN I verify usuarios nuevos.
