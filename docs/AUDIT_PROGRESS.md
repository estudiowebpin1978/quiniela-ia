# AUDIT_PROGRESS — Quiniela IA

**Fecha:** 2026-11-11
**Alias:** https://quiniela-ia-two.vercel.app/
**Rama:** main — último commit local: ca3c230

## Verificado en vivo (alias principal)

- 11/11 páginas adicionales devuelven 200 (`/`, /poceada, /poceada-federal, /poceada-federal/combinaciones, /brinco, /predictions, /rendimiento, /admin, /login, /perfil, `/pronostico/2026-11-11`, `/pronostico/2026-11-11/nocturna`) — smoke HTTP.
- `/api/draws?limit=3` → sorteos reales de hoy (Previa y Primera, 2026-11-11).
- `/api/poceada-federal/estado` → 2381 sorteos validados, corte al 2026‑11‑10.
- `/api/sorteos-similares` → `method: cloudflare` (antes local), 5 resultados.
- `/api/asistente-ia` (POST) → 200 con fallback determinístico.
- Endpoints mutadores sin auth: ahora **401** (`/api/cron-scrape-poceada`, `/api/poceada/verify-manual`, `/api/poceada-ciudad/verify-manual`, `/api/cron-scrape-poceada-federal-tujugada`).

## Commited health

- `npx tsc --noEmit` → 0 errores.
- `npm run build` -> Compiled successfully.
- `npx vitest run` → **392 passed**.
- Alias principal **NO pusheado** a GitHub: 58 archivos de diferencia — push pendiente de autorización expresa.

## Pendientes (sin credenciales, sin autorización)

- Registro/inicio de sesión con cuenta real.
- Pago real Ualá Bis.
- Transferencias reales (aprobación/rechazo admin).
- Autopiloto con cuenta Premium real.
