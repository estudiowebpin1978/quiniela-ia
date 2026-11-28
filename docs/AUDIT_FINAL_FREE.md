# Auditoría final — Quiniela IA (Quiniela de la Ciudad + Redoblonas, Free Tier)

Fecha: 2026-11-28 (pase final de eliminación de Poceada/Brinco)
Rama: `refactor/free-quiniela-redoblonas`
Deploy: https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev (version 8b232ef2-a5cd-49d5-bb9b-a3fec394db03)

## 1. Alcance final

Conservado:
- Quiniela de la Ciudad (Ex Nacional): turnos Previa, Primera, Matutina, Vespertina, Nocturna.
- Historial de sorteos (20 números), estadísticas, frecuencias, atrasos, Markov, ensemble.
- Predicciones 2/3/4 cifras según permisos (Free/Premium).
- Redoblonas (REDOBLONA OMEGA V2, Balanced, Both) integradas sobre el historial oficial.
- Usuarios, planes, pagos, webhooks, panel admin, mis predicciones, comparación automática.

Eliminado del todo:
- Poceada de la Ciudad (turno "Poceada", game_id d0e1f2a3...).
- Poceada Federal (Santa Fe / IAFAS) — módulo completo + cron + scraper tujugada.
- Brinco (Lotería de Santa Fe) — módulo completo + cron + scraper.

**Verificación final:** búsqueda case-insensitive de `poceada|brinco` sobre todo el
código fuente (`app/`, `lib/`, `components/`, `scripts/`, configs, workflows) →
**0 coincidencias**. En BD (Supabase): 0 tablas, 0 funciones, 0 vistas, 0 filas,
constraints restringidos a los 5 turnos y a `fuente = 'quiniela-ciudad'`.

## 2. Archivos eliminados (resumen)

Primera pasada:
- `app/poceada-federal/`, `app/poceada/`, `app/brinco/`
- `app/api/poceada-federal/`, `app/api/poceada/`, `app/api/poceada-ciudad/`, `app/api/brinco/`
- `app/api/cron-poceada-federal`, `app/api/cron-scrape-poceada*`, `app/api/cron-brinco`
- `app/api/predicciones/poceada-federal`, `app/api/predicciones/brinco-mejorado`
- `lib/poceada-federal/`, `lib/brinco/`, `lib/poceada/` (fechas.ts movido a `lib/fechas.ts`)
- `lib/probability/poceada.ts`, `lib/scrapers/poceada.ts`, `lib/scrapers/tujugada-poceada-federal.ts`
- Tests dedicados: 7 poceada-federal-*, 8 brinco-*, poceada-fechas
- Scripts dedicados: e2e-pf-post, stat-randomness-federal, pf_audit.py, backfill-poceada*, verify-poceada-official, brinco-backfill, brinco-oos
- Docs: docs/poceada-federal.md, docs/sql/poceada-federal-stats.sql
- Widget "Precisión del Motor IA" (HitRateBanner) + endpoint `/api/engine-metrics`

Pase final (2026-11-28):
- `verify_schema.py` (sólo chequeaba tablas brinco/poceada ya inexistentes).
- Migraciones exclusivas de los juegos eliminados (9 archivos):
  `supabase/migrations/20260921010000_verify_poceada.sql`,
  `20260921020000_poceada_materialized_views.sql`, `20260921030000_poceada_game_entry.sql`,
  `20260928020000_fix_verify_poceada_gameid.sql`, `20261009120000_brinco_premium.sql`,
  `20261015060000_poceada_federal_module.sql`, `20261017010000_security_draws_brinco_grants.sql`,
  `sql/migrations/003_poceada_federal_analisis.sql`, `sql/migrations/004_brinco_analisis.sql`.
- Tests con lógica Poceada eliminada/adaptados: ev, probabilidades (pPoceada/pAlMenosT/hipergeom/logChoose),
  premios-lotba (estructuraPoceada), verificacion (esPoceada/deriveNums 2º arg), api-aciertos (bloque esPoceada),
  cron-freshness (test semanal Brinco → thresholds extra removidos de `classifyDrawFreshness`),
  cross-turno, selector-meta, quiniela-time.

## 3. Archivos modificados (principales)

Primera pasada:
- `types/engine.ts`, `lib/quiniela-time.ts`, `lib/quiniela-timeline.ts`: turno "Poceada" removido de las listas.
- `lib/verificacion/criterio.ts`: `TODOS_TURNOS` 5 turnos; `estadoFinal` sin rama Poceada.
- `lib/scrapers/types.ts`, `lib/scrapers/parsers.ts`, `lib/scrapers/refrescar-on-demand.ts`: Poceada removido.
- `app/api/cron-scrape/route.ts`: bloque Poceada LOTBA + auto-heal removidos.
- `app/api/cron-backfill/route.ts`: game_id siempre Nacional.
- `lib/pipeline/precompute/lote-diario.ts`: TURNOS 5, sin esPoceada/topN=20/minDraws=3.
- `lib/cron/tareas-auxiliares.ts`: Brinco, precompute inline, ML training y walkforward removidos.
- `cloudflare.config.ts`: `limits.cpuMs` removido (incompatible con Free); 4 triggers.
- `cloudflare-worker.ts`, `app/api/cron-precompute/route.ts` (fan-out por turno), `app/api/cron-aux/route.ts`, `app/api/cron-verify-predictions/route.ts`.
- `app/sitemap.ts`, `app/admin/page.tsx`, `app/predictions/page.tsx`, `app/perfil/page.tsx`, `app/rendimiento/page.tsx`.
- `lib/selector/walkforward.ts`, `lib/__tests__/selector-meta.test.ts`, `scripts/selector-eval.ts`: mulberry32 movido a `lib/estadistica/backtest-utils.ts`.
- `lib/prediccion/vector-busqueda.ts`, `app/api/sorteos-similares-ciudad/route.ts`: FuenteSorteo solo quiniela-ciudad.

Pase final (2026-11-28) — rutas y libs:
- `app/api/{analisis/posicion,cron-sync-monitor,sync-status,cron-run,cron-verify-predictions,predictions,health,mis-predicciones,comparar,sorteos-similares,sorteos-similares-ciudad,asistente-ia,actualizar-sesgos}/route.ts`: sin POCEADA_GAME_ID, sin TURNOS "Poceada", sin ramas esPoceada/jurisdiccion 'ciudad', sin bloques Brinco/poceada_federal_draws de sync-status.
- `lib/procedencia.ts`: `jurisParaTurno` siempre `["CABA"]` (param `_turno` residual).
- `lib/verificacion/{criterio,historial,api-aciertos,auto-verify}.ts`: sin parámetros ni lógica esPoceada.
- `lib/estrategia/{probabilidades,ev,premios-lotba}.ts` + `app/api/estrategia/route.ts`: pPoceada/pAlMenosT/hipergeom/logChoose/estructuraPoceada/campo `poceada` eliminados.
- `lib/probability/calibration.ts`, `lib/verificacion/calibration.ts`, `lib/ml/xgboost-challenger.ts`: calibración sin game_id.
- `lib/scrapers/lotba-oficial.ts` (fetchPoceada* eliminados), `lib/scrapers/ocr-fallback.ts` (kind sólo "quiniela").
- `lib/{config.ts,config/lotba.ts,fresca-check.ts,analisis/*,pipeline/precompute/*,quiniela-timeline.ts,fechas.ts,estadistica/backtest-utils.ts,ml/integration.ts,selector/evaluar.ts}`: referencias restantes removidas.
- `app/predictions/page.tsx` (~25 sitios): HORARIOS/TURNOS_LIST sin Poceada, sin bloque "Poceada Ciudad — 2 juegos", `maxNums=10`, sin `esPoceadaPred` en el historial "Mis Análisis", sin `poceada_probs`.
- `app/predictions/predictions.css`, `app/perfil/perfil.css`: comentarios actualizados.

Scripts/docs/config:
- `scripts/oos-eval.ts` (sin isPoceada/topN=8/winThreshold=5), `scripts/backfill-analisis.js`
  (backfills Poceada/Brinco eliminados — llamaban RPCs ya dropeados), `scripts/backfill-factor-history.ts`,
  `scripts/redoblonas-bayes-backtest.ts`, `scripts/stat-randomness.ts`, `scripts/selector-eval.ts`.
- `README.md` (crons Brinco/Poceada fuera de la tabla), `vercel.json` (2 crons eliminados),
  `RAILWAY_DEPLOY.md`, `docs/{BACKUP_SUPABASE,CRONJOB_AUDIT,REGLA_SYNC_SIEMPRE_ANTES,meta-selector}.md`.
- `sql/migrations/{005_sorteos_embeddings,006_funciones_rpc_prediccion,TODAS_LAS_MIGRACIONES}.sql`:
  tablas/RPCs/funciones Poceada-Brinco y CHECK de `fuente` eliminados; el script consolidado queda en 189 líneas.
- `verify_migrations.py`: lista de tablas sin entradas poceada/brinco.

## 4. Base de datos (Supabase)

Datos eliminados (autorizado por el usuario):
- `draws`: 256 filas turno Poceada (primera pasada).
- `user_predictions`: 4; `predictions_cache`: 61; `engine_predictions_log`: 136; prediction_history/results/engine_predictions: 0.
- `games`: filas "Quiniela Poceada" y "Brinco (Santa Fe)".
- Tablas eliminadas: brinco_* (4), poceada_federal_* (5) — DROP TABLE CASCADE.
- Funciones eliminadas (primera pasada): brinco_combinacion_valida, poceada_federal_extracto_valido, get_estadisticas/get_frecuencia/insertar_poceada_federal_analisis.
- Cuenta de prueba QA eliminada (qa-20261111185425@quiniela-ia.test).
- Vistas materializadas refrescadas.

Pase final (migración idempotente `supabase/migrations/20261128120000_remove_poceada_brinco.sql`, ejecutada vía `supabase db query --linked`):
- DROP de funciones restantes: get_estadisticas_brinco, get_frecuencia_poceada_federal,
  insertar_poceada_federal_analisis, insertar_brinco_analisis (0 funciones con poceada/brinco después).
- `calculate_omega_v6` y `score_numbers_v6` reescritos: rama `p_turno='Poceada'` → siempre `ARRAY['CABA']`.
  Verificados con llamada real (10 filas cada uno).
- Constraints ajustados: `draws_turno_canonico` → sólo los 5 turnos; `sorteos_embeddings_fuente_check`
  → sólo `'quiniela-ciudad'` (tabla vacía, validación sin riesgo).

Queda una sola fuente de datos: `games` = "Quiniela Nacional" (1 fila). Verificación de filas por turno en
`draws`/`user_predictions`/`predictions_cache`/`prediction_history`: 0 filas fuera de los 5 turnos.

## 5. Free tier — estimación de consumo

Cloudflare Workers (Free): 10 ms CPU / 50 subrequests / 100k req/día.
- `limits.cpuMs` removido (bloqueaba el deploy con error 100328).
- Precompute fan-out por turno (cada invocación con su propio presupuesto de CPU).
- Tpesadas (ML training, walkforward) fuera del ticker auxiliar; `cron-aux` sólo premium-expiry + verify-catchup.

Triggers activos (4) y su estimación de invocaciones/día (sólo crons; el tráfico de
usuarios se suma aparte y no está medido aquí — no se inventa un número):
- `*/5 * * * *` cron-verify-predictions → 288 inv/día.
- `*/15 * * * *` cron-scrape → 96 inv/día.
- `7 * * * *` cron-aux → 24 inv/día.
- `20 4 * * *` cron-precompute (+ fan-out por turno, ≤5 invocaciones) → ≤6 inv/día.
Total crons ≈ **414 invocaciones/día** (cada una ≤10 ms CPU, ≤50 subrequests) → muy por
debajo de 100k req/día y del presupuesto de CPU; sin `limits` que bloqueen el deploy.

Supabase Free: datos Poceada/Brinco eliminados; índices existentes conservados. La limpieza
de filas/tablas **libera** cuota de almacenamiento y conexiones; no agregó tablas nuevas.

GitHub Free: CI (lint/typecheck/test/build) en la repo; sin minutos facturables de self-hosted.

## 6. Verificaciones (pase final, 2026-11-28)

- `npm run typecheck`: 0 errores.
- `npm run lint`: 0 errores, 5 warnings preexistentes (admin/eliminar-cuenta/InstallApp — ajenos a este refactor).
- `npm test`: **232 passed (21 archivos)**.
- `npm run build` (Next): OK (201 páginas).
- `npm run build:vinext`: OK.
- Deploy `npm run deploy:vinext`: OK, version 8b232ef2, 4 cron triggers.
- Smoke HTTP en producción:
  - `/` → 200; `/api/sync-status` → 200, **sólo 5 modalidades** (Previa..Nocturna), todas fresh, overall ok.
  - `/api/predictions?sorteo=primera` con `x-guest-mode: true` → 200 (10 números 2C; 3C/4C gated).
  - `/api/predictions?sorteo=poceada` → 400 "Sorteo inválido. Válidos: previa, primera, matutina, vespertina, nocturna".
  - `/api/cron-brinco` y `/api/cron-poceada-federal` → **404**.
  - `/api/health` → 200 (status `degraded` únicamente por "cache de hoy" aún no generada a esa hora — el precompute diario corre 04:20 UTC; sin alertas de Poceada/Brinco).
- Páginas eliminadas: `/poceada`, `/brinco`, `/poceada-federal` → **404** en producción.
- `/api/stats` → 200; `/api/estrategia?turno=nocturna` → 200 (redoblonas OK).
- `node scripts/e2e-auth-test.mjs` (contra prod): registro → login → upgrade premium →
  guardar predicción → historial → limpieza → **"TODO FUNCIONA ✅"**.
- `node scripts/audit-tables.mjs`: **29/29 tablas referenciadas existen** en Supabase (0 faltantes).
- Commit: `c4fa766` en `refactor/free-quiniela-redoblonas` (217 archivos, +2434/−15817).

## 7. Pendientes manuales

- [x] Eliminar dead-code esPoceada de app/predictions/page.tsx, lib/analisis/engine-v7.ts,
      lib/verificacion/auto-verify.ts, lib/verificacion/api-aciertos.ts (hecho en este pase).
- [ ] **cron-job.org**: borrar los jobs `8845214` (Brinco sync) y `8845223` (Poceada Federal sync)
      si siguen listados (ver docs/CRONJOB_AUDIT.md).
- [ ] Configurar backup automático a Cloudflare R2 (ver docs/BACKUP_SUPABASE.md).
- [ ] Verificar cron logs en producción durante 24 h (wrangler tail).
- [ ] Revisar los reports históricos fechados (`AUDIT_FINAL_2026-10-26.md`, `docs/ACIERTOS_OOS_2026-11.md`,
      `docs/AUDIT_FINAL_REPORT.md`, `docs/AUDIT_PROGRESS.md`, `docs/AUDITORIA_FORENSE_2026-11-17.md`,
      `docs/MODALIDADES_ESTADO_2026-11.md`, `docs/OMEGA_STATISTICAL_RESEARCH.md`): se conservaron
      como **registros históricos fechados** (describen estados pasados); no se editan para no
      falsear auditorías anteriores.
- [ ] Migraciones históricas mixtas en `supabase/migrations` (8 archivos con menciones puntuales:
      ramas esPoceada ya aplicadas en su momento): se conservan como historial aplicado
      (editarlas no cambia nada en BD; la migración nueva `20261128120000` deja el esquema vivo limpio).
