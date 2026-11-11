# AUDIT_PROGRESS - Quiniela IA

**Fecha:** 2026-11-11 (ambiente: alias prod quiniela-ia-two.vercel.app)

## Commits desplegados en prod (último: 50c1684)

1. **Poceada cache MMR fijado**: `diversifyMMR(...)` ahora respeta `maxSeleccion=topN`; Poceada pidió 20 números y el MMR los truncaba a 10 → cache incompleta. FIX VERIFICADO EN PRODUCCIÓN: cache Poceada 2026-11-11 tiene 20 posiciones.
2. **Cache Poceada corto no se sirve**: cache con `numeros_2.length < 16` se rechaza y cae a cálculo en vivo (`/api/predictions` y `lote-diario`).
3. **Vitest desbloqueado**: tsconfig incluye `lib/**` y `lib/__tests__/tsconfig.json` para que oxc vea los tests. **392 tests pasan**.
4. **NotificationBell**: lectura del token corregida → campana funcional.
5. **Demo falso eliminado**: `/poceada-federal/combinaciones` ahora redirige a `/poceada-federal` (eliminada ruta huérfana con datos falsos).
6. **Banners hardcode eliminados en /poceada**: el resultado de sorteo y los "sorteos analizados" ya no muestran números inventados.
7. **/rendimiento**: hit counts 3c/4c fabricados eliminados.
8. **pronostico/[fecha]/[turno]**: 404 correcto (no 200-con-notFound) vía `dynamicParams=false` + `dynamic='force-static'`; hardening posterior revierte a `force-dynamic` con `dynamicParams=true` para que el status sea 404 real.
9. **Dead links**: `/pronostico` → `/predictions`, `/mis-predicciones` (eliminado), `/risultati`, `/pronosticos`, `/estadisticas` (sitemap limpia) → rutas del sitemap apuntan a páginas reales.
10. **Seguridad**: 4 endpoints GET de mutación (`cron-scrape-poceada`, `poceada/verify-manual`, `poceada-ciudad/verify-manual`, `cron-scrape-poceada-federal-tujugada`) → autenticados con `CRON_SECRET` o admin JWT. `weight-optimizer` ya no reescribe todos los turnos con defaults.
11. **OCR fallback seguro**: regex ciega eliminada; Tesseract solo con `OCR_TESSERACT=1`; parser `RESULTADOS_DATA` endurecido (bracket-matcher).
12. **Perfil**: pestañas muertas `verif`/`premium` eliminadas; tipo de estado simplificado.
13. **Cloudflare Workers AI**: variables `CLOUDFLARE_*` agregadas en Vercel Prod → verificado `method: "cloudflare"` en `/api/sorteos-similares`.
14. **CRONSCR-201: cron-scrape 5xx** — `parseInt(n.val)` perdía zero-padding; validador `regex /^\d{4}$/` rechazaba números <1000 sistemáticamente. Verificado: último commit desplegado `50c1684` · cron-job.org lastStatus=1 · draws 2026-11-11 guardados con source alternando oficial/respaldo.

## Verificado en vivo (alias prod)

- 10 rutas HTTP 200: /, /poceada, /poceada-federal, /brinco, /predictions, /rendimiento, /admin, /login, /perfil.
- `/api/poceada-federal/estado` → 2381 validados, sync 7 h, sin brechas.
- `/api/sorteos-similares` → método cloudflare.
- `/api/asistente-ia` → 200 con fallback determinístico.
- `/api/draws?limit=3` → sorteos reales Previa/Primera 2026-11-11 ingeridos.
- Endpoints mutadores sin auth → **401**.
- `/api/cron-scrape` → lastStatus=1 (status 200) en 21:30 ART.
- `draws` 2026-11-11: Previa (lotba-oficial), Primera (lotba-oficial), Matutina (api.quiniela…), Vespertina (api.quiniela…).

## Pendientes (requiere intervención del usuario)

- **Ualá Bis**: role=free ya bloqueado en el save de Poceada-Casa para Free (requiere Premium); endpoint checkout no probado en end-to-end.
- **Cronjob de Brinco/Poceada Federal**: no se crearon — cron-job.org API no permite crear jobs con la clave API actual.
- **Approval de transferencias**: manual desde `/admin` (flujo vigente).
