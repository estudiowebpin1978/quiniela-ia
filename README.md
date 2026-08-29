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
  - Ejemplo: `TRANSFER_AUTO_APPROVE_HOURS=2` → auto-aprueba a las 2h.

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

## Configuración de Cron Jobs (cron-job.org)

Todos los jobs programados se gestionan vía **cron-job.org** (no Vercel Cron).

| Job | Endpoint | Frecuencia | Descripción |
|-----|----------|------------|-------------|
| Scrape Previa | `/api/cron-scrape?turno=previa` | 10:30 Mon-Sat | Scrape sorteo Previa |
| Scrape Primera | `/api/cron-scrape?turno=primera` | 12:30 Mon-Sat | Scrape sorteo Primera |
| Scrape Matutina | `/api/cron-scrape?turno=matutina` | 15:30 Mon-Sat | Scrape sorteo Matutina |
| Scrape Vespertina | `/api/cron-scrape?turno=vespertina` | 18:30 Mon-Sat | Scrape sorteo Vespertina |
| Scrape Nocturna | `/api/cron-scrape?turno=nocturna` | 21:30 Mon-Sat | Scrape sorteo Nocturna |
| **Auto-Predict Previa** | `/api/cron-auto-predict?turno=Previa` | 10:05 Mon-Sat | Genera predicciones antes del sorteo |
| **Auto-Predict Primera** | `/api/cron-auto-predict?turno=Primera` | 11:50 Mon-Sat | Genera predicciones antes del sorteo |
| **Auto-Predict Matutina** | `/api/cron-auto-predict?turno=Matutina` | 14:50 Mon-Sat | Genera predicciones antes del sorteo |
| **Auto-Predict Vespertina** | `/api/cron-auto-predict?turno=Vespertina` | 17:50 Mon-Sat | Genera predicciones antes del sorteo |
| **Auto-Predict Nocturna** | `/api/cron-auto-predict?turno=Nocturna` | 20:50 Mon-Sat | Genera predicciones antes del sorteo |
| Auto-approve transfers | `/api/cron-auto-approve-transfers` | Cada 30 min | Auto-aprueba transferencias > N horas |
| Push notifications | `/api/cron-push` | Cada 15 min | Envía notificaciones push |
| Verify catchup | `/api/cron-verify-catchup` | 09:00 daily | Verifica predicciones pendientes |

**Autenticación**: todos los endpoints cron aceptan `?secret=CRON_SECRET` o header `Authorization: Bearer CRON_SECRET` o header `x-vercel-cron: 1`.

### Configuración en cron-job.org

Los jobs de **Auto-Predict** deben ejecutarse ~10 minutos ANTES de cada sorteo para que las predicciones estén listas:

| Turno | Hora sorteo | Hora cron (ART) | Cron expression |
|-------|-------------|-----------------|-----------------|
| Previa | 10:15 | 10:05 | `5 10 * * 1-6` |
| Primera | 12:00 | 11:50 | `50 11 * * 1-6` |
| Matutina | 15:00 | 14:50 | `50 14 * * 1-6` |
| Vespertina | 18:00 | 17:50 | `50 17 * * 1-6` |
| Nocturna | 21:00 | 20:50 | `50 20 * * 1-6` |

**Nota**: Los jobs de scrape se ejecutan DESPUÉS del sorteo (para capturar resultados). Los jobs de auto-predict se ejecutan ANTES (para generar predicciones).

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

- El scraper en `app/api/cron-scrape/route.ts` usa 4 fuentes con fallback en cascada:
  1. `quiniela.loteriadelaciudad.gob.ar` (API oficial AJAX)
  2. `quinieleando.com.ar` (HTML estático)
  3. `loteria-ciudad.gob.ar` (CABA AJAX)
  4. `quinielanacionaln.com.ar` (HTTP fallback)
- Si las fuentes cambian, el scraping podría dejar de funcionar.
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