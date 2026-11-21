# Quiniela IA

## Qué contiene este proyecto

- Aplicación Next.js (`app/`) con panel de predicciones y administración.
- `app/api/cron-scrape/route.ts`: scraper protegido para cargar resultados de sorteos en Supabase (5 turnos).
- `app/api/mis-predicciones/route.ts`: API para leer las predicciones guardadas y calcular aciertos.
- `app/api/resultado/route.ts`: API para consultar resultados reales por fecha y turno.
- Modo invitado: permite solicitar análisis de 2 cifras sin cuenta; no actualiza sorteos ni guarda predicciones y mantiene el límite de peticiones por IP.
- GitHub Actions:
  - `.github/workflows/ci.yml` ejecuta `npm ci` y `npm run build` en cada push/pull request a `main`.

## Variables de entorno necesarias

Estas variables deben configurarse como Worker secrets en Cloudflare y localmente para desarrollo.

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

### AI Providers (fallback opcional — todo feature responde sin ninguna clave)
- `GROQ_API_KEY` - API key Groq (openai/gpt-oss-120b). Sin ella o sin cuota el Asistente IA en /rendimiento responde con el análisis deterministico local (200, mismo data, "fallback": true).
- `GROQ_MODEL` - override del modelo Groq (default `openai/gpt-oss-120b`).
- `GEMINI_API_KEY` - API key Google Gemini. Sólo si OCR de HTML/image fue insuficiente; el sistema ya resuelve con texto limpio + Tesseract.js OSS.
- `HF_API_KEY` — API key Hugging Face (fallback de embeddings, cuota baja).
- `HF_MODEL` - modelo HF (default `sentence-transformers/all-MiniLM-L6-v2`).
- `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` - Cloudflare Workers AI (gratuito, ~10k inferencia/dia). Método preferido para /api/sorteos-similares.
- `CF_EMBED_MODEL` - embedding model CF (default `@cf/baai/bge-m3`, multilingüe).

### Sin configurar ninguna clave (zero-cost fallback chain)
| Feature | Cadena | Resultado |
|---|---|---|
| Asistente IA (`/api/asistente-ia`) | Groq → deterministico local | 200 con análisis del historial |
| Sorteos Parecidos (`/api/sorteos-similares`) | CF Workers AI → Hugging Face → Dice local | 200 con ~5 resultados |
| OCR fallback (lots/pags LOTBA) | texto limpio local → Tesseract.js → Gemini | sin costo, sin cuotas por defecto |
| Cron verify/scrape | cron-job.org (libre) | sin cambios |

### Cloudflare Workers AI — credenciales opcionales
1. En https://dash.cloudflare.com Create account (free).
2. My Profile → API Tokens → Create Token con permisos mínimos para Workers AI. No reutilices el token de despliegue.
3. Account Home → copia Account ID.
4. Cloudflare Dashboard → Workers & Pages → `quiniela-ia` → Settings → Variables and Secrets → agrega `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_API_TOKEN`.
5. Probar `/api/sorteos-similares` → `method=cloudflare`.

### Turnos (opcional, default hardcoded)
- `TURNOS` — JSON array de turnos (ej: `["Previa","Primera","Matutina","Vespertina","Nocturna"]`).

---

## Configuración de Cron Jobs

Cloudflare Workers programa de forma nativa el scrapeo de seguridad cada 15 minutos y la verificación de predicciones cada 5 minutos. No dupliques esos dos trabajos en cron-job.org. La configuración de `vercel.json` no se ejecuta en Cloudflare Workers.

| Job | Endpoint | Frecuencia | Descripción |
|-----|----------|------------|-------------|
| **Verify predictions** | Cloudflare Cron → `/api/cron-verify-predictions` | Cada 5 min | Verifica aciertos contra sorteos oficiales y evalúa los factores V6 (`factor_weight_history`) |
| **Scrape + catch-up** | Cloudflare Cron → `/api/cron-scrape` | Cada 15 min | Scrapea resultados publicados y reintenta huecos de los últimos 4 días |
| **Poceada Federal** | cron-job.org → `/api/cron-poceada-federal` | Diario, después del sorteo | Importa resultados oficiales IAFAS y registra fallas de corroboración |
| **Brinco** | cron-job.org → `/api/cron-brinco` | Domingos, después del sorteo | Importa resultados oficiales y verifica predicciones |
| Scrape Previa | `/api/cron-scrape?turno=Previa` | 10:30 Mon-Sat | Scrape sorteo Previa |
| Scrape Primera | `/api/cron-scrape?turno=Primera` | 12:30 Mon-Sat | Scrape sorteo Primera |
| Scrape Matutina | `/api/cron-scrape?turno=Matutina` | 15:30 Mon-Sat | Scrape sorteo Matutina |
| Scrape Vespertina | `/api/cron-scrape?turno=Vespertina` | 18:30 Mon-Sat | Scrape sorteo Vespertina |
| Scrape Nocturna | `/api/cron-scrape?turno=Nocturna` | 21:30 Mon-Sat | Scrape sorteo Nocturna |
| Scrape Poceada | `/api/cron-scrape?turno=Poceada` | 21:15 Mon-Sat | Scrape sorteo Poceada |
| Auto-approve transfers | `/api/cron-auto-approve-transfers` | Cada 30 min | Auto-aprueba transferencias > N horas |
| Push notifications | `/api/cron-push` | Cada 15 min | Envía notificaciones push |
| Verify catchup | `/api/cron-verify-catchup` | 09:00 daily | Verifica predicciones pendientes |
| Premium expiry | `/api/cron-premium-expiry` | Diario 04:00 UTC | Downgrade de premium vencido + push de vencimiento |

**Autenticación**: los endpoints cron aceptan `?secret=CRON_SECRET` o el header `Authorization: Bearer CRON_SECRET`. En Vercel, configurá `CRON_SECRET` como variable de entorno: Vercel la envía automáticamente en `Authorization`. En cron-job.org, configurá ese header manualmente. `x-vercel-cron: 1` por sí solo no autentica una solicitud.

**Nota**: los jobs de scrape se ejecutan DESPUÉS del sorteo. Antes de responder, las rutas de predicción sincronizan el turno/modalidad solicitado y recuperan huecos recientes antes de consultar la caché. Esto aplica también al modo invitado. El cron de Quiniela reintenta automáticamente resultados faltantes de los últimos 4 días. Las predicciones son **on-demand** (`GET /api/predictions`); el antiguo cron Auto-Predict fue removido.

**Agendado externo**: los demás trabajos de la tabla siguen requiriendo cron-job.org. `/api/cron-run` (orchestrator scrape + precompute) y `/api/cron-premium-expiry` deben programarse allí si se necesitan; el Worker ya programa `/api/cron-scrape` y `/api/cron-verify-predictions`.

---

## Configuración de GitHub Actions

### CI

El flujo `.github/workflows/ci.yml`:
- Se ejecuta en `push` y `pull_request` para `main`.
- Instala dependencias con `npm ci`.
- Ejecuta lint, typecheck, pruebas y build.

El workflow `.github/workflows/cron.yml` es manual (`workflow_dispatch`); usa los secretos `APP_URL` y `CRON_SECRET` para pruebas o backfills solicitados. La programación de producción no depende de GitHub Actions.

---

## Despliegue en Cloudflare Workers

El proyecto está adaptado con vinext para desplegarse como Cloudflare Worker:

```bash
npm ci
npm run build:vinext
npm run start:vinext
```

Para desplegarlo en Cloudflare:

```bash
npx wrangler login
npm run deploy:vinext
```

Agrega las variables de entorno en el dashboard de Cloudflare Workers o mediante secretos:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put CRON_SECRET
```

El liveness del Worker está disponible en `/api/live`.

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
- `npm run build:vinext` — compilar para Cloudflare Workers.
- `npm run start:vinext` — previsualizar el Worker localmente.
- `npm run deploy:vinext` — desplegar en Cloudflare Workers.
- `npm run lint` — ejecutar ESLint.
