# Auditoría Forense — Quiniela IA (2026-11-17)

Veredicto por módulo audítado y evidencias reales en repo y BD producción.
No se acepta el código pegado por el dueño por defecto: dictámenes abajo.

## MÓDULO 1 — Ingesta y scrapers multi-lotería (SSOT)
**ESTADO: Implementado (revisado y endurecido en esta sesión).**

| Cosa | Evidencia |
|---|---|
| LOTBA consenso 3-fuente | `lib/scrapers/consensus.ts` (quorum k/3, fail-safe) |
| LOTBA oficial + Poceada oficial | `lib/scrapers/lotba-oficial.ts` |
| Brinco (CAS + extracto OFICIAL) | `lib/brinco/scraper-cas.ts` + `scraper-extracto.ts` (TLS :8443, fallback bajo cada request, verificación on-demand) |
| Poceada Federal (IAFAS + SF corroborado) | `lib/poceada-federal/actualizar.ts` (confirmado en prod hoy: `sync pre-GET importados:1`) |
| Crons externos | cron-job.org: Push, Scraping, Verify, Verificacion, Brinco, PoceadaFederal (diario 22:30 ART) |
| RLS/writes | service-role sólo server-side; RLS deny-all tablas de sorteos |
| Regla R1 (sync antes de responder) | `docs/REGLA_SYNC_SIEMPRE_ANTES.md` + `lib/scrapers/refrescar-on-demand.ts` |

Bug de jurisdicción Poceada (drawrzados con 'CABA' → nunca se verificaban): **corregido** en
`refrescar-on-demand.ts` + `cron-scrape.guardarDraw` (`jurisParaTurno[0]`).

**Fatal para la integridad: tablas paralelas DUPLICADAS**
El SQL sugerido `official_other_draws` duplicaría `draws`/`poceada_federal_draws`/`brinco_draws`: fragmentaría la fuente única
y rompería verificación/referencias. **RECHAZADO**. Las tablas existentes son autoritativas.

## MÓDULO 2 — Cero Math.random / motores 100% estadísticos
**ESTADO: Implementado.**

Evidencia (grep exhaustivo en lib/ y app/):
- Único uso de `Math.random` en runtime: `lib/logger.ts`/`lib/scrapers/logger.ts` (ids de log) y `lib/sound/audio-manager.ts` (ruido de audio) — ninguno toca predicciones.
- Generación de picks determinista: V6 = SQL (`calculate_omega_v6`), V7 = TS determinista (`lib/analisis/engine-v7.ts`), ML = argmax Markov + forest treinado determinista (`lib/ml/*`, seeded-rng), Monte Carlo con seed por datos, Poceada probability fully deterministic, monte-carlo = bootstrap (muestreo con reemplazo) sobre histórico — nunca Math.random en path de predicción.
- Walk-forward reporta `is_hit` anti-refrendado por fuentes reales — ver análisis en `docs/ACIERTOS_OOS_2026-11.md`.

Findings del dueño "predicción libre: tablas sin datos reales" — **falso**, la generación es 100% histórica (frecuencia, atraso, Markov, co-ocurrencia, Monte Carlo, 100k+ datos).

## MÓDULO 3 — MOTOR DE REDOBLONAS (foco crítico pedido)
**ESTADO: Implementado (corrección aquí); antes NO existía co-ocurrencia.**

Situación previa:
- Redoblona generada = top-1 + top-2 del blend (`construirRedoblona()` en `lib/pipeline/precompute/blend.ts`).
- Criterio de verificación INTERNO (2026-10-13, blend.ts): par presente en los 20 sorteados, cualquier orden (reglas.ts vía `matchearAciertos`).
- Predicciones de usuario: 230 elecciones, 8 aciertos (3.5%) ≈ azar 3.84% — sin ventaja, como todo el sistema.
- No existía ningún motor de co-ocurrencias.

Correcciones implementadas en esta sesión:
- `lib/analisis/redoblonas-coocurrencia.ts` — motor puro determinista, computa co-ocurrencias de pares 2C sobre draws oficiales (únicos por sorteo), frecuencia, P(A∧B), P(A|B), sobre-azar vs azar 3.84%.
- `app/api/redoblonas/route.ts` — GET público con agregados honestos, timeout, caché 30 min, filtra jurisdicción.
- `components/RedoblonasCoOcurrencia.tsx` + sección Premium en `/predictions` (bajo el hero, sólo roles premium/admin).
- Tests: `lib/__tests__/redoblonas-coocurrencia.test.ts` (5 tests, determinismo confirmado).

**RECHAZO a los snippets pegados:**
1. `RedoblonaEngine` ingenuo enumera pares i<j sobre 20 números INCLUYENDO duplicados mod 100 → par (x, x) se cuenta con solo la aparición de x: exagera frecuencia y falsea condicionales. Reimplementado limpio usando únicos.
2. El `verificarRedoblona` pegado: coincide con el criterio interno del sistema.
3. El `user_redoblona_predictions` con RLS `INSERT WITH CHECK (true)` permite a cualquier sesión sembrar predicciones apócrifas y falsear stats. `user_predictions` ya guarda `redoblona jsonb` (RPC lo lee atómica).

**Nota honesta del propio motor:** co-ocurrencia describe el pasado; no hay ventaja OOS demostrada para pares. Distingue únicamente qué pares salieron más seguido con datos reales.

## MÓDULO 4 — Verificación y cierre de ciclo
**ESTADO: Implementado (verificación en 3 niveles), con 1 brecha conocida documentada.**

| Camino | Estado |
|---|---|
| Cron verificación cada 5 min (`cron-verify-predictions`) | Activo — marca WON/NEAR_MISS/LOST, poceadas, fill de forecast_history, stats atómicas |
| RPC `verify_predictions_for_draw` (volcatalog SQL) | VERIFICADO en línea al guardar un draw (cron-scrape, refrescar-on-demand, auto-heal LOTBA) — failure mode documentado |
| Trigger `trg_verify_on_official_draw` sobre `official_draws` (webhook) | Activo — aciertos y 6 stats |
| Trigger sobre `draws` | INTENCIONALMENTE deshabilitado (20260828200000 para evitar doble-conteo) |
| Verificación Brinco (2 caminos), Poceada Federal | `verificarPendientesBrinco()` (extracto oficial :8443) y `evaluarPendientes()` (IAFAS) — 2/nov 46/46 evaluadas |

Bugs corregidos en esta sesión relacionados:
- Poceada Ciudad jurisdiccion 'CABA' en guardado → verificador no la encontraba (historia vacía) — corregido (ver `docs/ACIERTOS_OOS_2026-11.md`).
- Redoblona TS vs RPC (deliberadamente divergente; criterio INTERNO mantenido y documentado) — no se retro-ajusta arbitrariamente; la RPC conserva su semántica actual.

Security advisory: `sweep_expired_predictions()` GRANT a `anon/authenticated` — acción SQL del dueño, no bloqueada por código.

## Veredicto general (0 docs de UI modificados para "cumplir", ninguno)

1. El sistema NO es mock ni al azar: generación 100% estadística sobre datos oficiales reales.
2. El motor de redoblonas (foco pedido) está ahora implementado con co-ocurrencia real, y su resultado está en prod (/predictions, visible Premium).
3. **Ningún reclaim de mejora de aciertos sobre azar es legítimo** — medido: ninguna técnica supera al azar (docs/ACIERTOS_OOS_2026-11.md §2), como exige el principio de honestidad de este proyecto.
4. El código pegado en el brief contiene piezas de mock (scraper con selectores inexistentes, policy RLS abierta): rechazadas y reproyectadas según la arquitectura real.

Notas de integridad del motor: el `RedoblonaEngine` pegado enumera pares i<j incluyendo duplicados mod-100 en el mismo sorteo (exagera co-ocurrencias y falsea condicionales). Reimplementado limpio usando únicos. El `verificarRedoblona` pegado coincide con el criterio INTERNO del sistema — se conserva.
