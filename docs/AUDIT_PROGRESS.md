# AUDIT_PROGRESS — Quiniela IA

**Fecha:** 2026-11-11  
**Alias:** https://quiniela-ia-two.vercel.app/  
**Estado:** PARTIALLY FIXED — ver `AUDIT_FINAL_REPORT.md` para el informe completo.

## Correcciones desplegadas (alias actual)

| Bloque | Archivos | Resultado |
|---|---|---|
| Tests vitest (tsconfig) | `tsconfig.json`, `lib/__tests__/tsconfig.json`, mock `ultimaPrediccion` | 392 passed |
| Poceada cache MMR | `lib/pipeline/precompute/blend.ts` (`diversifyMMR(..., topN)`), `lote-diario.ts` (Poceada<16 → invalid) | Poceada puede llenar 20; cache roto rechazado |
| `predictions_route.ts` | no servir cache corto Poceada | cae a cálculo correcto |
| OCR fallback | `lib/scrapers/ocr-fallback.ts` sin regex ciega; Tesseract bajo `OCR_TESSERACT=1` | Elimina riesgo de números inventados |
| `extractResultadosData` | `lib/scrapers/lotba-oficial.ts` bracket-matcher | Más robusto ante variaciones |
| `NotificationBell` | `components/NotificationBell.tsx` `quiniela-ia-auth` | Campana funcional |
| `/poceada-federal/combinaciones` | redirect a `/poceada-federal` | Elimina demo falso |
| `/poceada` | banner hardcoded → nota honesta | sin números inventados |
| `/rendimiento` | hit counts fake eliminados | métricas reales |
| `/pronostico/[fecha]/[turno]` | 404 para turno inválido; fecha regex | mejor SEO |
| Sitemap/JSON-LD | solo rutas reales | sin 404 en sitemap |
| Admin | `loadCrons` lazy; botón duplicado; `perfil` intacto | menos ruido |
| `/terminos` | ya no dice «no procesa dinero» | coherencia legal |
| Security endpoints | 4 G without auth -> requieren CRON_SECRET o admin JWT | testeado 401 |
| `weight-optimizer` | Solo el turno solicitado | ya no pisa engine_config |

## Pendientes / NOT VERIFIED
- Ualá Bis (checkout/webhook real) — sin credenciales de prueba.
- Registro/login con cuenta real — sin credenciales.
- cron-job.org — sin acceso al panel.
- E2E propios — no hay suite
- Motor Omega (promoción/OOS) — no ejecutado en esta sesión.

## Evidencia detallada
Ver `docs/AUDIT_FINAL_REPORT.md`.
