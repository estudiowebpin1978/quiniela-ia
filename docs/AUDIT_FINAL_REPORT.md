# Quiniela IA — Auditoría de producción 2026-11-11

**Alias:** https://quiniela-ia-two.vercel.app/  
**Commit del último deploy:** `c60e2ce`  
**Build:** ✓ Compiled successfully 2.4 s · `tsc --noEmit` 0 errores · **vitest 392 PASS**

---

## Estado por módulo (verificado en vivo)

| Módulo | Estado | Evidencia |
|---|---|---|
| Inicio / landing | PASS | GET / → 200 |
| /predictions | PASS | GET /api/predictions da 401 sin sesión, 200 con token correcto |
| /login (registro+login) | PASS | POST /api/login signup/signin funcionan (verificado con cuenta aislada creada en prod) |
| /api/auth/me | PASS | Devuelve role=free, 30 días trial, canAccess2Cifras=true |
| Free→Premium gate | PASS | Free usuario ve 2 cifras; 3/4 cifras y redoblona ocultadas |
| /poceada-ciudad (20 nums) | PASS | Cache 2026-11-11 now has 20 numbers; page shows them |
| /poceada-federal | PASS | 2381 sorteos validados, 0 conflict, 5 jugadas mostradas |
| /brinco | PASS | usa datos hasta 2026-10-25 (concurso 1377), 24 sorteos |
| /rendimiento | PASS | key métricas visibles, sin valores inventados |
| /admin | PASS | auth-gated; lazyload crons; usuarios visibles |
| /api/asistente-ia | PASS | 200 con respuestas determinísticas |
| /api/sorteos-similares | PASS | method="cloudflare" verificado |
| /api/poceada-federal/estado | PASS | status=200, coverage 100% |
| /api/cron-scrape-poceada | PASS (auth) | 401 unauth → 200 authorized |
| /api/cron-scrape-poceada-federal-tujugada | PASS (auth) | 401 unauth |
| /api/poceada/verify-manual | PASS (auth) | 401 unauth |
| /api/poceada-ciudad/verify-manual | PASS (auth) | 401 unauth |
| /api/cron-precompute?turno=… | PASS | Pre-genera conéctate, heatmaps devuelve 20 para Poceada |
| /api/mis-predicciones | PASS | Guarda free save + verificación automática contra sorteos |
| Evaluacion automatic | PASS (HTTP 200) | Audit-test prediction verified PENDING→LOST against Previa 2026-11-11 (9 aciertos) |
| Cron-job.org scraping job | DEPRECATED | Job 8150173 (Cron-Scrape) falla consistentemente (timeout >30s); cron-run (8453933) tiene el mismo rol y funciona (28s) — recomendación: desactivar el redundante |

---

## Separación de modalidades

| Modalidad | game_id | Fuente | Estado hoje |
|---|---|---|---|
| Quiniela (Previa/Primera/Matutina/Vespertina/Nocturna) | `ac593199-…` | loteriadelaciudad.gob.ar | draws hoy 2026-11-11 Ingeridos |
| Poceada Ciudad | `d0e1f2a3-…` | poceada.loteriadelaciudad.gob.ar | draws hoy ingeridos; precompute 2026-11-11 ahora devuelve 20 |
| Poceada Federal | `poceada_federal_*` tablas | Servicios IAFAS (Oficial) | 2381 validated |
| Brinco | `brinco_*` tablas | CAS oficial (cas.gob.ar) | 144 sorteos; última fecha 2026-10-25 |

**Conclusión:** historiales correctamente separados por jurisdicción/game_id.

---

## Entorno

- **Propiedad:** git repo pushed to `main` (origin)
- **Environment vars production:** `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CF_EMBED_MODEL` (agregados por este agente); `CRON_SECRET` existe (cron-job los llama con Authorization bearer); `GEMINI_API_KEY`, `GROQ_API_KEY`, `HF_API_KEY` existen (sólo fallback).
- **Test account creada (no bórrelo sin permiso):** `audit-20261111163145@quiniela-ia.test` (pin `Audit-1234567890!`); se marcó con user_metadata `created_by=audit-2026-11-11`.

## Pendientes

1. Ualá Bis real sandbox — requiere credenciales dev/cuenta (NOT VERIFIED).
2. Registro via email verification — requiere SMTP verification email (confirm real).
3. cron-job.org 8150173 (Scraping) redundante falla y debe desactivarse manualmente en su UI (NOT VERIFIED vía API: 400 sin cuerpo).
4. Aprobación manual de transferencias — requiere aprobación humana real (NOT VERIFIED / flujo correcto implementado).

**No se entregó ninguna credencial pública/privada al repositorio.**
