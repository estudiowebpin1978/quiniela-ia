# Quiniela IA

## Qué contiene este proyecto

- Aplicación Next.js (`app/`) con panel de predicciones y administración.
- `app/api/cron-scrape/route.ts`: scraper protegido para cargar resultados de sorteos en Supabase (5 turnos).
- `app/api/mis-predicciones/route.ts`: API para leer las predicciones guardadas y calcular aciertos.
- `app/api/resultado/route.ts`: API para consultar resultados reales por fecha y turno.
- GitHub Actions:
  - `.github/workflows/ci.yml` ejecuta `npm ci` y `npm run build` en cada push/pull request a `main`.

## Variables de entorno necesarias

Estas variables deben configurarse en Vercel y también localmente para el desarrollo.

### Core (requeridas)
- `NEXT_PUBLIC_SUPABASE_URL` — URL de Supabase.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — clave anónima (cliente).
- `SUPABASE_SERVICE_ROLE_KEY` — clave de servicio de Supabase (server-only).
- `CRON_SECRET` — secreto para proteger endpoints cron (`/api/cron-*`).

### Pagos (Ualá Bis)
- `UALA_USERNAME` — usuario Ualá Bis.
- `UALA_CLIENT_ID` — client ID Ualá Bis.
- `UALA_CLIENT_SECRET` — client secret Ualá Bis.

### Transferencias / Alias
- `TRANSFER_AUTO_APPROVE_HOURS` — horas antes de auto-aprobar transferencias pendientes (default: `1`).
  - Ejemplo: `TRANSFER_AUTO_APPROVE_HOURS=2` â†’ auto-aprueba a las 2h.

### Push Notifications (VAPID)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — clave pública VAPID.
- `VAPID_PRIVATE_KEY` — clave privada VAPID.

### Admin
- `ADMIN_EMAILS` — emails admin separados por coma (ej: `estudiowebpin@gmail.com,otro@dominio.com`).

### AI Providers (fallback opcional)
- `GROQ_API_KEY` — API key Groq.
- `GEMINI_API_KEY` — API key Google Gemini.

### Turnos (opcional, default hardcoded)
- `TURNOS` — JSON array de turnos (ej: `["Previa","Primera","Matutina","Vespertina","Nocturna"]`).

---

## Configuración de Cron Jobs (cron-job.org + Vercel Cron)

La mayoría de los jobs se gestionan vía **cron-job.org**; `/api/cron-premium-expiry` se ejecuta con **Vercel Cron** (diario 04:00 UTC, definido en `vercel.json`).

| Job | Endpoint | Frecuencia | Descripción |
|-----|----------|------------|-------------|
| **Verify predictions** | `/api/cron-verify-predictions` | Cada 5 min | Verifica aciertos contra sorteos oficiales y evalúa los factores V6 (`factor_weight_history`) |
| **Scrape safety net** | `/api/cron-scrape` | Cada 15 min | Scrapeo periódico de los turnos con sorteo |
| Scrape Previa | `/api/cron-scrape?turno=Previa` | 10:30 Mon-Sat | Scrape sorteo Previa |
| Scrape Primera | `/api/cron-scrape?turno=Primera` | 12:30 Mon-Sat | Scrape sorteo Primera |
| Scrape Matutina | `/api/cron-scrape?turno=Matutina` | 15:30 Mon-Sat | Scrape sorteo Matutina |
| Scrape Vespertina | `/api/cron-scrape?turno=Vespertina` | 18:30 Mon-Sat | Scrape sorteo Vespertina |
| Scrape Nocturna | `/api/cron-scrape?turno=Nocturna` | 21:30 Mon-Sat | Scrape sorteo Nocturna |
| Scrape Poceada | `/api/cron-scrape?turno=Poceada` | 21:15 Mon-Sat | Scrape sorteo Poceada |
| Auto-approve transfers | `/api/cron-auto-approve-transfers` | Cada 30 min | Auto-aprueba transferencias > N horas |
| Push notifications | `/api/cron-push` | Cada 15 min | Envía notificaciones push |
| Verify catchup | `/api/cron-verify-catchup` | 09:00 daily | Verifica predicciones pendientes |
| **Premium expiry** (Vercel Cron) | `/api/cron-premium-expiry` | Diario 04:00 UTC | Downgrade de premium vencido + push de vencimiento |

**Autenticación**: los endpoints cron aceptan `?secret=CRON_SECRET` o el header `Authorization: Bearer CRON_SECRET`. En Vercel, configurá `CRON_SECRET` como variable de entorno: Vercel la envía automáticamente en `Authorization`. En cron-job.org, configurá ese header manualmente. `x-vercel-cron: 1` por sí solo no autentica una solicitud.

**Nota**: los jobs de scrape se ejecutan DESPUÉS del sorteo (para capturar resultados). Las predicciones son **on-demand**: se generan cuando el usuario las solicita (`GET /api/predictions`) — el antiguo cron Auto-Predict fue removido.

**Agendado externo**: `/api/cron-run` (orchestrator scrape + precompute) y la cadencia de 15 min de `/api/cron-scrape` se programan **externamente desde cron-job.org**; no figuran en `vercel.json`, que solo define `/api/cron-premium-expiry`.

---

## Configuración de GitHub Actions

### CI

El flujo `.github/workflows/ci.yml`:
- Se ejecuta en `push` y `pull_request` para `main`.
- Instala dependencias con `npm ci`.
- Ejecuta `npm run build`.

---

## Requisitos para despliegue en Vercel

1. Agregar las variables de entorno listadas arriba.
2. Verificar que el proyecto use `npm run build`.
3. Activar el despliegue automático en Vercel si deseas.

---

## Notas importantes

- El pipeline de scrapeo en vivo (`app/api/cron-scrape/route.ts` + `lib/scrapers/consensus.ts`) usa **1 fuente oficial: LOTBA** (`quiniela.loteriadelaciudad.gob.ar`), con validación de cada sorteo (20 números con formato de 4 dígitos) y cross-check contra la página oficial de CABA antes de guardarlo.
- El histórico (**+260 días de sorteos**, ~96% de los días con sorteo — domingos y feriados no tienen sorteo) se completó con backfill desde fuentes oficiales y de terceros (`quinieleando.com.ar`, `quinielanacionaln.com.ar`, etc.); esas fuentes de terceros solo se usaron para historia, no para el pipeline en vivo.
- Si la fuente oficial cambia, el scraping podría dejar de funcionar.
- Asegúrate que Supabase tenga correctamente las tablas `draws`, `user_predictions`, `prediction_history`, `engine_predictions`, `pending_transfers`, `webhook_logs` con los campos usados.
- RLS habilitado en todas las tablas sensibles.
- Trigger `trg_verify_predictions` evalúa predicciones automáticamente al insertar sorteos.

---

## Comandos útiles

- `npm run dev` — iniciar en modo desarrollo.
- `npm run build` — compilar para producción.
- `npm run start` — arrancar servidor de producción.
- `npm run deploy` — deploy a producción en Vercel.
- `npm run lint` — ejecutar ESLint.
