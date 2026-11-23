# Migración a Railway/Render — Guía paso a paso

## ✅ Lo que ya está preparado (automáticamente)

| Archivo | Estado | Descripción |
|---------|--------|-------------|
| `Dockerfile` | ✅ Creado | Imagen Node.js 18 con Next.js |
| `railway.toml` | ✅ Creado | Configuración de build y variables |
| `.env.example` | ✅ Actualizado | Variables de entorno completas |
| `migrate-to-railway.sh` | ✅ Creado | Script de ayuda para migración |
| Verificación tsc | ✅ Pasada | `tsc --noEmit` exit 0 |
| Verificación tests | ✅ Pasada | 412 tests pass |
| Verificación build | ✅ Pasada | `npm run build` exit 0 |

## 🔧 Lo que hacer manualmente (3 pasos)

### Paso 1 — Crea cuenta en Railway

1. Ve a https://railway.app
2. Haz click en "Start for free"
3. Autentícate con GitHub (es la forma más fácil)
4. No necesitas tarjeta de crédito para el plan gratuito ($5 créditos/mes)

### Paso 2 — Conecta tu repositorio

1. En el dashboard de Railway, haz click en "New Project"
2. Selecciona "Deploy from GitHub repo"
3. Busca y conecta tu repositorio `quiniela-ia` (el que tiene tu código)
4. Railway detectará automáticamente que es Next.js
5. Haz click en "Deploy Now"

### Paso 3 — Configura las variables de entorno

1. Ve a Settings → Variables del proyecto
2. Pega todas las variables del archivo `.env.example` que ves a continuación:

   - Copia el contenido completo
   - Pega en el campo "Variables"

## 📋 Variables de entorno requeridas

Copia todo esto en Railway → Settings → Variables:

```
NODE_ENV=production
NEXT_PUBLIC_BASE_URL=https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev
NEXT_PUBLIC_SUPABASE_URL=https://wazkylxgqckjfkcmfotl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-anon-aqui
SUPABASE_SERVICE_ROLE_KEY=tu-clave-service-role-aqui
SUPABASE_JWT_SECRET=tu-jwt-secret-aqui
CRON_SECRET=tu-cron-secret-aqui
ADMIN_EMAIL=estudiowebpin@gmail.com
ADMIN_EMAILS=estudiowebpin@gmail.com
TRANSFER_AUTO_APPROVE_HOURS=1
NEXT_PUBLIC_VAPID_PUBLIC_KEY=tu-vapid-public-key
VAPID_PRIVATE_KEY=tu-vapid-private-key
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
GROQ_API_KEY=tu-groq-api-key
GEMINI_API_KEY=tu-gemini-api-key
HF_API_KEY=tu-hf-api-key
HF_MODEL=sentence-transformers/all-MiniLM-L6-v2
CLOUDFLARE_ACCOUNT_ID=tu-account-id
CLOUDFLARE_API_TOKEN=tu-api-token
CF_EMBED_MODEL=@cf/baai/bge-m3
GROQ_MODEL=openai/gpt-oss-120b
UALA_USERNAME=tu-uala-username
UALA_CLIENT_ID=tu-uala-client-id
UALA_CLIENT_SECRET=tu-uala-client-secret
UALA_WEBHOOK_SECRET=
```

## 🔄 Actualizar los cron-jobs en cron-job.org

Una vez que Railway te de el dominio, ve a:

https://cron-job.org → Cronjobs → cada uno de tus 6 crons y actualiza la URL:

| Cron original | Nuevo URL |
|---------------|-----------|
| `quiniela-ia-two.vercel.app/api/cron-push` | `https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev/api/cron-push` |
| `quiniela-ia-two.vercel.app/api/cron-scrape` | `https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev/api/cron-scrape` |
| `quiniela-ia-two.vercel.app/api/cron-verify-catchup` | `https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev/api/cron-verify-catchup` |
| `quiniela-ia-two.vercel.app/api/cron-verify-predictions` | `https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev/api/cron-verify-predictions` |
| `quiniela-ia-two.vercel.app/api/cron-brinco` | `https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev/api/cron-brinco` |
| `quiniela-ia-two.vercel.app/api/cron-poceada-federal` | `https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev/api/cron-poceada-federal` |
| `quiniela-ia-two.vercel.app/api/cron-sync-monitor` | `https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev/api/cron-sync-monitor` |

El `CRON_SECRET` se mantiene igual.

## ✅ Verificación post-deploy

Una vez deployado, prueba:

```bash
# 1. Verifica que el sitio responde
curl https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev/api/sync-status

# 2. Verifica que las predicciones funcionan
curl https://quiniela-ia.httpsquiniela-ia-twovercelapp.workers.dev/api/predictions?sorteo=primera
```

Debe responder con `overall: ok` y `alerts: []`.