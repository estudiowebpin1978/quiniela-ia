# Backup y recuperación de Supabase (plan Free)

Supabase Free no incluye backups automáticos suficientes. Procedimiento manual
recomendado (costo $0).

## Exportar

1. Con Supabase CLI autenticado (`supabase login`) y proyecto vinculado
   (`supabase link --project-ref wazkylxgqckjfkcmfotl`):

   ```bash
   supabase db dump --linked --data-only -f backup_$(date +%Y%m%d).sql
   supabase db dump --linked -f schema_$(date +%Y%m%d).sql
   ```

2. Guardar los archivos en un bucket privado de Cloudflare R2 (cuota gratuita)
   o en almacenamiento local cifrado. **Nunca** subir backups al repositorio.

## Restaurar

```bash
supabase db query --linked -f backup_YYYYMMDD.sql
```

Verificar conteos de `draws`, `user_predictions`, `predictions_cache` y
`games` (debe existir únicamente `Quiniela Nacional`).

## Verificación de integridad

- `SELECT count(*) FROM public.draws WHERE turno NOT IN ('Previa','Primera','Matutina','Vespertina','Nocturna');` → 0
- `SELECT count(*) FROM public.games;` → 1
- Ejecutar `npm run typecheck && npm test && npm run build` antes de redeploy.

## Recuperación ante deploy fallido

Cloudflare Workers mantiene la versión anterior activa si el deploy falla.
Para revertir manualmente: `git checkout <commit-anterior> && npm run build:vinext && npm run deploy:vinext`.
`