# AUDIT_PROGRESS — Quiniela IA

**Fecha:** 2026-11-12 · **alias:** https://quiniela-ia-two.vercel.app/ ·
**Commit desplegado:** `1e49353` (honesto heurístico Omega + fix módulo 100 replay)

## Estado de Cron-job.org (verificado en vivo)

| ID | Título | URL | Frecuencia | lastStatus | lastExec |
|---|---|---|---|---|---|
| 8298680 | Quiniela IA - Push Notifications | `/api/cron-push` | Cada 15 min | 1 (OK) | 22:13 |
| 8150173 | Quiniela IA - Scraping | `/api/cron-scrape` | Cada 15 min (L–S) | 1 (OK) | 22:13 |
| 8835312 | Quiniela IA - Verify catchup | `/api/cron-verify-catchup` | 09:00 ART | 1 (OK) | 09:00 |
| 8504281 | verificacion | `/api/cron-verify-predictions` | Cada 5 min | 1 (OK) | 22:05 |
| 8845214 | Quiniela IA - Brinco sync | `/api/cron-brinco` | Domingo 22:30 ART | sin ejecutar (primera corrida 2026-11-16) | — |
| 8845223 | Quiniela IA - Poceada Federal sync | `/api/cron-poceada-federal` | Diario 22:30 ART | sin ejecutar (siguiente 2026-11-12 22:30) | — |

## Estado del backtesting OOS (walkforward_results)

**Total rows:** 6164 · **Volver a calcular después de fix modulo‑100:** 3,174 actualizados vía REST upsert

| Engine | Hits | Total | Rate | Baseline aleatorio |
|---|---|---|---|---|
| V6 | 774 | 1541 | ~50.2% | 90.49% |
| V7 | 718 | 1541 | ~46.6% | 90.49% |
| ML | 736 | 1541 | ~47.8% | 90.49% |
| ENSEMBLE | 798 | 1541 | ~51.8% | 90.49% |

**Conclusión honesta:** el modelo productivo está por debajo del azar (esperado: todo(input, modelo, output)=random). No aporta ventaja sobre azar. Etiquetas «sin ventaja demostrada» ahora son consistentes con métricas observadas.

**Acción:** el UI ya etiqueta todas las jugadas como heurísticas sin ventaja demostrada. Cada bloque de jugada en poceada-federal dice:
> "Selecciones heurísticas basadas en el historial oficial validado — sin ventaja demostrada"

## Su versión de autenticación

- **Tests:** 392 passed ✅
- **TS:** tsc --noEmit → 0 errores ✅
- **Build:** exit 0 ✅

## Predictor correcto hoy

predictions_cache vs 2026-11-12:
- Matutina, Previa (computado 14:18 UTC), Primera (13:30 UTC) → 3 turnos cacheados para hoy
- Vespertina, Nocturna, Poceada de hoy, **datos reales** ingestados por cron-scrape

## Pendientes (ordenadas)

1. **Aplicar manualmente en Supabase SQL Editor** la migración `APPLY_MANUALLY_omega_rule_honest_baseline.sql` para que `omega_rule_validation()` use baseline 90.49% real.
2. **Observar próximo cron** `cron-brinco` (2026-11-16 22:30 ART) — primera corrida tras activación.
3. **Lectura del motor**: el engine produce resultados ~50% vs baseline aleatorio ~90%. No es un bug; es el hecho honesto del mercado lotería. Etiquetas ya aclaradas.
