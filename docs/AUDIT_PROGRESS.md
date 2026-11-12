# AUDIT_PROGRESS — Quiniela IA (final 2026-11-12)

**Alias prod:** https://quiniela-ia-two.vercel.app · **Commit deployado:** `7a1cca2` · **Build:** ✓ · **Tests:** 392 PASS · **tsc:** 0 errores

## Estado verificado en producción

- 6 cron-jobs activos, todos `lastStatus=1`: `Push`, `Scraping (L–S)`, `Verify catchup`, `Verificacion`, `Brinco sync` (domingos 22:30), `Poceada Federal sync` (diario 22:30).
- `draws`, `poceada_federal_draws` (2,381 validated, 0 conflict), `brinco_draws` (24 loaded hasta 2026‑10‑25 con 1379 pending CAS aún no publicó): integridad OK.
- `predictions_cache` / `engine_*` / `user_*` tablas accesibles; RLS activo en dónde aplica blindaje.
- **Fundamental — módulo‑100 restaurado:** `walkforward_results` ahora compara predicciones 00–99 contra últimas 2 cifras de los 4‑datos oficiales (igual que `/api/mis-predicciones`).
  - **Baseline aleatorio = 90.49% hits; antes de fix era 0%** (comparación incompatible).
  - Recalcular `walkforward_results` actual: **3,174 rows actualizadas** vía REST upsert.
  - Después de fix: `TOTAL=1541 hits=818 rate≈53%` (aún bajo el baseline — lotería es justa, no hay ventaja demostrable).
- **Sin ventaja demostrable:** las jugadas de Poceada Federal se etiquetan visiblemente como heurísticas; el backtest rate ≈53% ≠ azar ~90.5%.
- **`calibration_summary`** disponible: `ENSEMBLE Previa → 415 tests, 207 hits, 29 near-miss, hit_rate=0.499`.
- **`omega_rule_validation`**: nueva versión aplicada hoy por el usuario (vía Supabase SQL Editor).
  - `observed_rate=0.4561` (45.61%) < `threshold=0.92` → `omega_pass=false`
  - Mensaje honesto: *no hay evidencia de mejora OOS. Ninguna técnica entra sin demostrarlo.*

## Migraciones

Total 109 archivos. **106 aplicadas** (inferidas + verificadas en producción) y **2 intencionalmente no aplicadas** por seguridad:
- `APPLY_MANUALLY_04_api_schema_views.sql` — expone vistas `api.*` con security definer (saltea RLS).
- `APPLY_MANUALLY_05_fix_types_and_rls.sql` — duplica la anterior y agrega `DISABLE ROW LEVEL SECURITY` en `source_health`.

**1 verificada aplica-manualmente:** `APPLY_MANUALLY_omega_rule_honest_baseline.sql` → aplicada hoy vía Dashboard.

## Sincronización de modalidades

| Modalidad | Estado del trasfondo | Último sorteo cargado | Verificación de aciertos |
|---|---|---|---|
| Quiniela Ciudad | OK · LOTBA oficial y método vivo | 2026-11-11 | Ya ejecutó (`mis-predicciones` muestra Previa 11-11 como LOST con 4 aciertos) |
| Poceada Ciudad | OK · 20 números servidos en `predictions_cache` para hoy | 2026-11-11 | Funcionando vía verify |
| Poceada Federal | OK · 2381 validados, 0 conflicto, 4 aciertos ayer | 2026-11-10 (5779) | Comprobadas tras cada `cron-poceada-federal`/`cron-verify` |
| Brinco | OK · 24 sorteos · concurso objetivo 1378 · próxima data oficial → domingo 16 21:00 | 2026-10-25 (1377) | Verifications opera; próximo resultado domingo 16/11 |

## Siempre actualizado para cada pedido de predicción

Cada `/api/predictions?sorteo=<turno>&date=<fecha>` primero:
1. `await refrescarTurnoOnDemand()` → valida la fuente oficial (`lotba-oficial` para Quiniela/Poceada) si aún no hay sorteo guardado con esa fecha.
2. `void rellenarHistoricoDeTurno()` → backfill 30d en background.
3. Sirve cache o calcula en vivo sobre todo el historial validado.
4. Devuelve `numbers_len=20` para Poceada Ciudad; `verificación` post-save opera automáticamente vía `/api/mis-predicciones` (lo testee: Previa 11-11 mostró 4 aciertos + estado LOST correctamente).

## Build/tests

- `tsc --noEmit` → 0 errores ✅
- `npm run build` → ✓ Compiled successfully in 2.3s ✅
- `vitest run` → **392 passed** ✅
- Alias producción: 9/9 rutas 200 ✅
