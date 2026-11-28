# Despliegue en Railway

La aplicación se construye con el `Dockerfile` de la raíz. Railway detecta ese
archivo automáticamente; el contenedor escucha en el puerto que Railway inyecta
en `PORT`.

## Preparar el servicio

1. Crea un proyecto Railway y conecta el repositorio de GitHub.
2. En **Settings → Networking**, genera un dominio público antes del primer build.
3. En **Variables**, configura las variables requeridas de abajo. Define
   `NEXT_PUBLIC_BASE_URL` como referencia Railway:
   `https://${{ RAILWAY_PUBLIC_DOMAIN }}`.
4. Despliega. Al cambiar una variable `NEXT_PUBLIC_*`, dispara un nuevo build:
   Next.js las incluye en los recursos del navegador durante la compilación.
5. Configura **Healthcheck Path** como `/api/live` en los ajustes del
   servicio. Es una comprobación ligera de que el proceso web responde; usa
   `/api/sync-status` por separado para revisar la frescura de datos.

No fijes `PORT`: Railway asigna el puerto y `next start` lo consume. Tampoco
configures `OLLAMA_HOST=http://localhost:11434`; Ollama no corre dentro de este
contenedor. Si se usa un servidor Ollama separado, configura su dirección de red
accesible desde Railway.

## Variables requeridas

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_BASE_URL` | URL pública; usar `https://${{ RAILWAY_PUBLIC_DOMAIN }}` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Acceso server-side a Supabase; mantener privada |
| `SUPABASE_JWT_SECRET` | Validación de JWT |
| `CRON_SECRET` | Secreto largo y aleatorio compartido con los cron jobs |

Las variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_BASE_URL` y `RAILWAY_PUBLIC_DOMAIN` se pasan al stage de build en el
Dockerfile. No pongas claves privadas en variables `NEXT_PUBLIC_*`.

## Variables opcionales

Configura sólo las integraciones que se usan:

- `ADMIN_EMAILS`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`
- `GROQ_API_KEY`, `GEMINI_API_KEY`, `HF_API_KEY`, `HF_MODEL`
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CF_EMBED_MODEL`
- `UALA_USERNAME`, `UALA_CLIENT_ID`, `UALA_CLIENT_SECRET`,
  `UALA_WEBHOOK_SECRET`
- `RESEND_API_KEY`

No copies literalmente los valores de ejemplo ni pegues secretos en archivos del
repositorio.

## Tareas programadas

`vercel.json` no agenda tareas en Railway. El workflow de
[cron.yml](./.github/workflows/cron.yml) es manual y no reemplaza los cron jobs
recurrentes. En el proveedor de cron actualiza cada URL para usar el dominio
público generado por Railway y conserva su frecuencia:

- `/api/cron-push`
- `/api/cron-scrape`
- `/api/cron-verify-catchup`
- `/api/cron-verify-predictions`
- `/api/cron-sync-monitor`

Envía el encabezado `Authorization: Bearer <CRON_SECRET>` en las rutas protegidas;
no pongas el secreto en la URL. Para ejecutar el workflow manual desde GitHub,
configura los secrets de Actions `APP_URL` (dominio público Railway) y
`CRON_SECRET`.

Si mantienes los trabajos `pg_cron` de Supabase, aplica la migración
`20261123233724_railway_pg_cron.sql` y configura en Supabase los ajustes
`app.settings.railway_app_url` (origen HTTPS de Railway) y `app.settings.cron_secret`
(el mismo secreto de `CRON_SECRET`) ejecutando en el SQL Editor:

```sql
ALTER DATABASE postgres SET app.settings.railway_app_url = 'https://<dominio-publico>';
ALTER DATABASE postgres SET app.settings.cron_secret = '<mismo-valor-de-CRON_SECRET>';
```

No guardes esos valores en migraciones ni en Git. Desactiva los cron triggers
del Worker anterior para evitar ejecuciones duplicadas.

## Comprobaciones

Después del despliegue:

1. `GET https://<dominio-publico>/api/sync-status` debe devolver HTTP 200 y un
   JSON con estado `overall`.
2. Prueba `/api/predictions?sorteo=primera` y confirma que devuelve datos.
3. Ejecuta un cron manualmente con el encabezado de autorización y comprueba su
   respuesta y los logs de Railway.

`/api/sync-status` puede devolver `overall: "attention"` si faltan sorteos; eso
indica estado de datos y no necesariamente que el proceso web esté caído.
