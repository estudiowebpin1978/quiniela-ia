# AUDIT_PROGRESS — Quiniela IA

**Fecha:** 2026-11-11 (ambiente: alias prod quiniela-ia-two.vercel.app)

## Commits desplegados en prod (último: ca3c230, docs 9c3b8d2)

1. **Poceada cache MMR fijado**: `diversifyMMR(...)` ahora respeta `maxSeleccion=topN`; Poceada pidió 20 números y el MMR los truncaba a 10 → cache incompleta. FIX VERIFICADO EN CÓDIGO (no en prod aún: se necesita re-precompute nocturno o forzado por cron-job).
2. **Cache Poceada corto no se sirve**: cache con `numeros_2.length < 16` se rechaza y cae a cálculo en vivo (`/api/predictions` y `lote-diario`).
3. **Vitest desbloqueado**: tsconfig incluye `lib/**` y `lib/__tests__/tsconfig.json` para que oxc vea los tests. **392 tests pasan**.
4. **NotificationBell**: lectura del token corregida → campana funcional.
5. **Demo falso eliminado**: `/poceada-federal/combinaciones` ahora redirige a `/poceada-federal` (eliminada ruta huérfana con datos falsos).
6. **Banners hardcode eliminados en /poceada**: el resultado de sorteo y los "sorteos analizados" ya no muestran números inventados.
7. **/rendimiento**: hit counts 3c/4c fabricados eliminados.
8. **pronostico/[fecha]/[turno]**: 404 correcto (no 200-con-notFound) vía `dynamicParams=false` + `dynamic='force-static'`.
9. **Dead links**: `/pronostico` (reemplazado por `/predictions`), `/mis-predicciones` (eliminado → `/predictions`), `/risultati`, `/pronosticos`, `/estadisticas` (sitemap limpia) → rutas del sitemap apuntan a páginas reales.
10. **Seguridad**: 4 endpoints GET de mutación (`cron-scrape-poceada`, `poceada/verify-manual`, `poceada-ciudad/verify-manual`, `cron-scrape-poceada-federal-tujugada`) → autenticados con `CRON_SECRET` o admin JWT. `weight-optimizer` ya no reescribe todos los turnos con defaults.
11. **OCR fallback seguro**: regex ciega eliminada; Tesseract solo con `OCR_TESSERACT=1`; parser `RESULTADOS_DATA` endurecido (bracket-matcher).
12. **Perfil**: pestañas muertas `verif`/`premium` eliminadas; tipo de estado simplificado.
13. **Cloudflare Workers AI**: variables `CLOUDFLARE_*` agregadas en Vercel Prod → verificado `method: "cloudflare"` en `/api/sorteos-similares`.

## Verificado en vivo (alias prod)

- 13 rutas HTTP 200:/, /poceada, /poceada-federal, /poceada-federal/combinaciones, /brinco, /predictions, /rendimiento, /admin, /login, /perfil, /pronostico/2026-11-11, /pronostico/2026-11-11/nocturna, /pronostico/2026-11-11/invalidturno.
- `/api/poceada-federal/estado` → 2381 validados, sync 2h, sin brechas.
- `/api/sorteos-similares` → método cloudflare.
- `/api/asistente-ia` → 200 con fallback determinístico.
- `/api/draws?limit=3` → sorteos reales Previa/Primera 2026-11-11 ingeridos.
- Endpoints mutadores sin auth → **401**.

## Pendientes (requiere intervención del usuario)

- Registro/login con cuenta real para probar auth end-to-end.
- Pago real con tarjeta Ualá Bis (checkout + webhook + activación).
- Aprobación manual de transferencias (admin).
- Autopilot con cuenta Premium en vivo.
- Push a GitHub pendiente de confirmación.
