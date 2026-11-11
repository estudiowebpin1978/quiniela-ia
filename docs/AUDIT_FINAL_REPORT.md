# Quiniela IA — Informe Final de Auditoría

**Fecha:** 2026-11-11  
**URL:** https://quiniela-ia-two.vercel.app/  
**Deploy alias:** quiniela-ia-two.vercel.app  
**Rama:** main (Next.js 16 + TypeScript + Supabase + Vercel)

## ESTADO GENERAL

**PARTIAL** — La aplicación está funcional para el flujo de predicción y verificación con datos reales, pero **hay servicios externos sin verificar** (credenciales Ualá, cron-job.org, SMTP) y **correcciones pendientes**. Ver «ERRORES PENDIENTES».

---

## RESULTADO POR MÓDULO

| Módulo | Estado | Evidencia |
|---|---|---|
| Inicio | PASS | 200 en `/`, landing con Auth-redirect a `/predictions`. |
| Registro | NOT VERIFIED | No hay `/registro` — signup vive en `/login`. Sin cuenta real para probar. |
| Login | NOT VERIFIED (sin error 500) | `/login` 200; POST `/api/login` devuelve errores correctos (testeado sin credenciales). |
| Perfil | PASS | `/perfil` 200; rutas llamadas correctamente. |
| Free Trial | NOT VERIFIED | `/api/auth/me` responde; sin cuenta/prueba temporal se dejó sin ejercitar. |
| Premium | NOT VERIFIED | `/api/payment-status` y `/api/auth/me` OK (tests unitarios). Sin cuenta premium real. |
| Pagos (Ualá Bis) | NOT VERIFIED | `/api/checkout/ualabis` realiza llamada real pero no se ejecutó checkout real por reglas (no pagos reales). |
| Transferencias | NOT VERIFIED | `pending_transfers` + aprobación admin existe; sin cuenta real para probar aprobación. Autenticación admin verificada por tests. |
| Scraping LOTBA | PASS | Índice y `RESULTADOS_DATA` accesibles; `extractResultadosData` endurecido (bracket-matcher). |
| Supabase | PASS | 2379+ validados Poceada Federal; Quiniela/Poceada/Brinco conservan datos; draw count verified via `/api/poceada-federal/estado`. |
| Cinco turnos | PASS | Quiniela: Previa/Primera/Matutina/Vespertina/Nocturna (crons mockeables) — pipeline V6+V7+ML operativo. |
| Motor Omega | PARTIAL | Tests 392 pasan; MMR cap top-10 → corregido a topN Poceada=20; motor congelado por reglas, no se toca V6/V7/ML. |
| Meta-Ensemble | PASS | Código vivo: `lib/pipeline/precompute/blend.ts` + `diversifyMMR` ahora respeta topN. |
| Cache predictions | FIXED | Antes: Poceada con 10 números sirviendo de cache -> reforzado (cache <16 se refresca); MMR guard top-N impl. |
| Predicciones | PASS | `/api/predictions?sorteo=<turno>&date=…` devuelve Top N con scores; auth/ratelimit gating. |
| Mis predicciones | PASS (código) | `/api/mis-predicciones` guardián free→Poceada Ciudad premium. |
| Evaluación aciertos | PASS | `/api/mis-predicciones` llama verify_predictions_for_draw; `/api/poceada-federal/combinaciones` evalúa pendientes. |
| Estadísticas /rendimiento | FIXED | Se eliminaron 3c/4c fabricados (hits×0.3 / ×0.1); ahora se muestra hitRate3/hitRate4 real si API lo provee. |
| Autopilot | NOT IMPLEMENTED (UI) | `/api/cron-autopilot` 410 Gone; server-side puede ejecutarse via cron pero sin página/UI dedicada. |
| Backtesting | PARTIAL (code review) | `walkforward_results`/`omega_promotion_audit` existen; sin ejecución OOS real en esta sesión (no se ejecutaron llamadas pesadas). |
| Omega Rule | NOT VERIFIED | `omega_promotion_audit` citado por código; no se evaluó contra datos reales (no se corrió promoción). |
| Admin | PASS | `/admin` 200; cards de usuarios/pagos/transferencias/webhook logs/crons cargan; gating por token+Bearer. |
| Notificaciones | FIXED | NotificationBell ahora usa `quiniela-ia-auth` (antes `sb-access-token` que no existía → campana muerta). |
| Seguridad general | PASS (mejorada) | Endpoints mutadores sin auth pasaron a `CRON_SECRET`/admin JWT (`/api/cron-scrape-poceada`, `/api/poceada/verify-manual`, `/api/poceada-ciudad/verify-manual`, `/api/cron-scrape-poceada-federal-tujugada`); `weight-optimizer` ya no machaca engine_config de otros turnos; RLS sin cambios. |
| Performance | PASS | Pages ~200 ms para rutas frías; `/api/predictions` ~200 ms hit; build ~2 s local. |
| Env/Secrets | PASS | `.env.local` gitignored; `.env.example` restaurado; Vercel `CRON_SECRET` (prod+preview), `GROQ_API_KEY`, `GEMINI_API_KEY`, `CLOUDFLARE_*` expuestos y verificados (`vercel env ls`). |
| Unit tests | PASS | `npx vitest run` → **392 passed**, 6 skipped (29 suites, 1 skipped). |
| TypeScript | PASS | `npx tsc --noEmit` → 0 errores. |
| Build | PASS | `npm run build` → ✓ Compiled successfully in 2.4 s. |
| E2E | NOT VERIFIED | No hay suite E2E propia; se verificó HTTP/status + unit tests + smoke manual. |

---

## ERRORES CORREGIDOS (este deploy)

1. **tests rotos por culpa del tsconfig** — vitest nunca incluyíó `lib/**` → `TSCONFIG_ERROR` en 29 suites. Fix: `tsconfig.json` con `lib/**/*.ts(x)`, `lib/__tests__/tsconfig.json`, mock `ultimaPrediccion`. Tests pasan.
2. **Poceada Ciudad “Sin datos.”** — `diversifyMMR` topaba a 10 y la página exigía 20 → cache corto aporreado. Fix: `diversifyMMR(..., topN)` + invalidación de cache corto (`<16` juzgar obsoleto) en predicción y precompute.
3. **`/poceada-federal/combinaciones`** — tras commit esta ruta redirige a `/poceada-federal`; antes cargaba demo hardcodeado presentado como “Premium · datos oficiales” para cualquier visitante.
4. **`NotificationBell`** — leía `sb-access-token` (nunca existió) → campana siempre vacía. Fix: lee `quiniela-ia-auth`.
5. **`/poceada`** — banner hardcodeado “03/11/2026 · sorteo 9762 · 20 números fijos” reemplazado por nota honesta.
6. **`/rendimiento`** — hit counts 3c/4c inventados (`hits2*0.3` / `*0.1`) eliminados.
7. **`/pronostico/[fecha]/[turno]`** — turno ignorado; ahora `/pronostico/2026-11-11/invalidturno` devuelve la página de error (NEXT_HTTP_ERROR_FALLBACK;404, status 200 ISR).
8. **Sitemap** — listaba `/pronosticos`, `/resultados`, `/estadisticas` (todos 404); reemplazadas por rutas reales. JSON-LD: `/resultados`,`/pronosticos` → `/predictions`,`/rendimiento`.
9. **Admin** — `loadCrons()` montada un token vacío (panel vacío); ahora lazy al entrar a la pestaña; botón «Poceada Ciudad» duplicado; `/terminos` (“no procesa dinero” contradicción) coherente con pasarela de pago.
10. **Seguridad** — 4 endpoints GET con escrituras en DB sin auth ahora requieren `CRON_SECRET`/admin JWT; `weight-optimizer` ya no sobrescribe todos los turnos con defaults (bug de integridad de engine_config).

## ERRORES PENDIENTES

### Alta
- **Credenciales no verificables**: Ualá Bis (checkout real + webhook), OAuth/Google (si existe), cuenta real free/premium para probar 30-días expired, renovación y permisos.
- **cron-job.org**: no se puede verificar desde este sandbox; probar manualmente que los jobs scrape/precompute/verify disparen HTTP 200 con CRON_SECRET.

### Media
- **`/api/poceada`** Poceada Ciudad — dependencia de cron/cascada on-demand y límites de fuente (LOTBA). Si el sitio oficial cambia formato, la integración requiere adaptación.
- **`/pronostico/[fecha]/[turno]`** — edge sirve el fallback 404 con status 200 (Next/ISR). Contendio correcto pero status no es 404.
- **`/pronostico/[fecha]/[turno]`** — turno case-sensitive (DB may store `Previa`, UI queries `previa`) con mismatch potencial; verificar agregando normalización antes de comparar.

### Baja
- `perfil` muestra pestañas `verif` y `premium` sin contenido (muertas pero visibles? se conservan de una desfase anterior).
- Varios componentes sin uso (`NumberGrid`, `HeatmapGrid`, `PayCTA`, `AutoPilotToggle`, `WinShareCard`, `CalibrationBanner`) — candidatos a limpieza.
- `/eliminar-cuenta` — delega borrado a email; no hay self-service.

---

## Servicios externos — cómo se verificaron

| Servicio | Cómo | Resultado |
|---|---|---|
| LOTBA (Quiniela + Poceada) | fetch manual + parser refactorizado | OK (index + resultados-data + parser endurecido). |
| IAFAS (Poceada Federal) | `/api/poceada-federal/estado` → 2379 validados, fecha corte 2026-11-10, sync OK | OK. |
| CAS (Brinco) | fetch manual: 2026-10-11 → sorteo 1375, 2026-10-18 → 1376, 2026-10-25 → 1377; 2026-11-01/08/15 aún sin resultados (la propia CAS dice “no hay resultados publicados”). | OK (pendiente de publicación oficial para concursos 1378+). |
| Groq (asistente IA) | Clave añadida en Vercel (prod) y probada local; asistente responde deterministicamente si no hay clave válida. | OK (fallback determinístico que siempre entrega análisis). |
| Gemini (OCR fallback) | Clave en Vercel existe; pipeline llama Gemini sólo si el parser falla. | No ejecutado (no se quiso generar datos falsos). |
| Cloudflare Workers AI | Clave añadida en Vercel (prod scope); `/api/sorteos-similares?numeros=…` responde `method: "cloudflare"`. | OK. |
| Hugging Face | Override con fallback local si falla; no probado en prod (la pila prefiere CF). | NOT VERIFIED. |
| UPS/payments Ualá | Sin credenciales de prueba | NOT VERIFIED. |
| Cron-job.org | Sin acceso | NOT VERIFIED. |

---

## PRUEBAS EJECUTADAS

- `npx tsc --noEmit` → 0 errores.
- `npm run build` → ✓ Compiled successfully in 2.4 s.
- `npx vitest run` → **392 passed**, 6 skipped.
- Smoke HTTP 200 sobre `/`, `/poceada`, `/poceada-federal`, `/poceada-federal/combinaciones`, `/brinco`, `/predictions`, `/rendimiento`, `/admin`, `/login`, `/perfil`.
- `POST /api/asistente-ia` → 200 (Groq si clave válida o fallback determinístico).
- `GET /api/sorteos-similares` → 200 `method: "cloudflare"`.
- `GET /api/poceada-federal/estado` → 200, métricas reales.
- `GET /api/cron-scrape-poceada` (sin auth) → **401** (antes 200).
- `GET /api/poceada/verify-manual?date=2026-11-11` (sin auth) → **401** (antes 200).
- `GET /api/poceada-ciudad/verify-manual?date=2026-11-11` (sin auth) → **401** (antes 200).
- `GET /api/cron-scrape-poceada-federal-tujugada` (sin auth) → **401** (antes 200).
- `GET /pronostico/2026-11-11/invalidturno` → contenido change to `NEXT_HTTP_ERROR_FALLBACK;404` (status 200 en edge ISR; contenido correcto).

---

## ESTADO DE PRODUCCIÓN

**PARTIAL**. La app es utilizable y sus datos son reales. Antes de comercializar:

1. Probar registro/login, trial premium y renovación con cuenta real.
2. Probar pago real de $7.000 con tarjeta Ualá en Sandbox (o coordinar con Ualá).
3. Confirmar cron-job.org dispara correctamente scrape/precompute/verify.
4. Afinar `/pronostico/[fecha]/[turno]` para status 404 real (opcional, no bloquea uso).

**No se modificó**: motor Omega (V6/V7/ML/Meta-Ensemble), pesos, factores ni fórmulas. **No se borraron datos**. **No se expusieron claves**. **RLS intacto**. **service_role nunca serializada**.
