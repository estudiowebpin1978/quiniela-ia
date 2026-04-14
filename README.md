# Quiniela IA

## Qué contiene este proyecto

- Aplicación Next.js (`app/`) con panel de predicciones y administración.
- `app/api/cron/route.ts`: scraper protegido para cargar resultados de sorteos en Supabase.
- `app/api/mis-predicciones/route.ts`: API para leer las predicciones guardadas y calcular aciertos.
- `app/api/resultado/route.ts`: API para consultar resultados reales por fecha y turno.
- GitHub Actions:
  - `.github/workflows/ci.yml` ejecuta `npm ci` y `npm run build` en cada push/pull request a `main`.
  - `.github/workflows/cron.yml` puede llamar diariamente a `/api/cron`.

## Variables de entorno necesarias

Estas variables deben configurarse en Vercel y también localmente para el desarrollo.

- `NEXT_PUBLIC_SUPABASE_URL` — URL de Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` — clave de servicio de Supabase.
- `CRON_SECRET` — secreto para proteger `/api/cron`.

## Configuración de GitHub Actions

### CI

El flujo `.github/workflows/ci.yml`:
- Se ejecuta en `push` y `pull_request` para `main`.
- Instala dependencias con `npm ci`.
- Ejecuta `npm run build`.

### Cron diario

El flujo `.github/workflows/cron.yml`:
- Se ejecuta una vez al día (`0 0 * * *`).
- Llama a `https://<APP_URL>/api/cron?secret=<CRON_SECRET>`.
- Requiere los siguientes secretos en GitHub:
  - `APP_URL`
  - `CRON_SECRET`

## Requisitos para despliegue en Vercel

1. Agregar las variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`
2. Verificar que el proyecto use `npm run build`.
3. Activar el despliegue automático en Vercel si deseas.

## Notas importantes

- El scraper en `app/api/cron/route.ts` depende del HTML de `quinielanacional1.com.ar`.
- Si esa página cambia, el scraping podría dejar de funcionar.
- Asegúrate que Supabase tenga correctamente las tablas `draws` y `user_predictions` con los campos usados.

## Comandos útiles

- `npm run dev` — iniciar en modo desarrollo.
- `npm run build` — compilar para producción.
- `npm run start` — arrancar servidor de producción.
