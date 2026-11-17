# REGLA DURA R1 — La base de datos se actualiza SIEMPRE antes de cada pedido de predicción

**Enunciado (2026-11-17, orden del dueño):**
> "que se actualicen la base de datos automaticamente siempre antes de cada
> pedido de prediccion" — aplica a TODAS las modalidades.

## Implementación (código)

| Modalidad / endpoint | Sync antes de responder | Archivo |
|---|---|---|
| Quiniela (todas las turnos) + Poceada Ciudad | `refrescarTurnoOnDemand(turno, date)` + `rellenarHistoricoDeTurno` (fire-and-forget), **await antes de cualquier cache** | `app/api/predictions/route.ts` |
| Poceada Federal (generación) | `sincronizar({ repo: repoSinc })` (IAFAS + extracto/corroboración SF) | `app/api/poceada-federal/combinaciones/route.ts` POST |
| Poceada Federal (lecturas) | idem best-effort (nunca 5xx por sync) | `app/api/poceada-federal/combinaciones/route.ts` GET |
| Brinco (generación) | `actualizarIncrementalBrinco()` (CAS o extracto oficial :8443) | `app/api/brinco/prediccion/route.ts` |
| Brinco (historial/guardar jugada) | idem + `verificarPendientesBrinco()` | `app/api/brinco/historial/route.ts` GET y POST |
| Verificación de predicciones | RPC `verify_predictions_for_draw` / `verificarPendientesBrinco()` / `evaluarPendientes()` corren demand-driven y en crons | varios |

**Regla de falla:** el sync es *best-effort* — si la fuente oficial no responde, la respuesta NO falla: se devuelve el historial ya cargado con los datos declarados como usados en la propia respuesta (`sorteos*`, `sincronizacion`/`totalSorteos` reales).

## Invariantes de la regla

1. **Siempre ANTES**: el sync precede a cualquier lectura (cache/memoria/DB) de la respuesta. Ninguna página devuelve picks basados en datos vencidos.
2. **Sólo fuentes oficiales**: LOTBA (Ciudad), Lotería de Santa Fe + IAFAS (Poceada Federal), CAS/Lotería de Santa Fe (Brinco). Nunca un agregador no oficial como camino de escritura.
3. **Idempotencia**: `upsert_draw` sólo si falta o difiere; nunca se pisa un sorteo con datos peores ("nunca vacío sobre datos").
4. **Reloj oficial**: el sorteo se guarda recién tras `hora oficial + 2 min buffer` (ART) para no fabricar "resultado" antes de tiempo; los soroctetos aparecen cuando el extracto oficial los publica.
5. **Jurisdicción dura**: `Poceada → 'ciudad'`, `Previa..Nocturna → 'CABA'` — en TODOS los caminos de guardado (stats, cron, webhooks). Violación conocida corregida 2026-11 (cron-run, refrescar-on-demand, cron-scrape hardening).
6. **Sync barato cuando no hay novedad**: un GET por sorteo/día faltante; ante varios usuarios simultáneos no multiplica llamadas a las fuentes (sin escrituras redundantes).

## Cómo verificar la regla en producción

1. Pedir una predicción: `GET /api/predictions?sorteo=Nocturna&t=<cachebuster>` → verificar en la UI "sorteos oficiales analizados (de → hasta)".
2. `/brinco`: mostrar "datos hasta" igual a la última fecha de sorteo importada.
3. `/poceada-federal`: "Generar nuevo análisis" → la respuesta incluye `sincronizacion: { ok, datosNuevos, importados… }`.
4. Logs Vercel: `vercel logs --query "actualizar"` → `[refresh-on-demand] draw saved` o `[brinco-actualizar] extracto oficial`.

## Qué NO cubre (y por qué)

- Predicciones de **juegos distintos** o picks externos a la app: sin contrato.
- **Estadísticas agregadas** (`/api/stats`, `/api/rendimiento`, asistente IA): leen historial ya validado; el cron de verificación los mantiene vivos (cada 5 min + catch-up diario). No son "pedido de predicción".
- **Hora oficial no publicada**: el sorteo no existe para esta app hasta que la autoridad lo publica; la app lo incorpora apenas exista (el fallback importador cura esa ventana).

*Si agregás un endpoint que devuelve picks/predicciones nuevas, esta regla lo alcanza — hay que sincronizar antes de responder.*
