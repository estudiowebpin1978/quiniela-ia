# QA.md — Quiniela IA

## Pre-Deploy Checklist

### TypeScript
- [ ] `npm run build` — 0 errores
- [ ] `tsc --noEmit` — 0 errores
- [ ] No `any` types
- [ ] No `ts-ignore`
- [ ] No `@ts-expect-error` sin justificación

### ESLint
- [ ] `npm run lint` — 0 errores, 0 warnings
- [ ] No `eslint-disable` sin justificación
- [ ] No `console.log()` (usar logger)

### Code Quality
- [ ] No código muerto (imports, funciones, variables)
- [ ] No duplicación (DRY)
- [ ] No TODOs/FIXMEs
- [ ] No mocks ni placeholders
- [ ] No comentarios explicativos innecesarios

### Architecture
- [ ] Server First (lógica en Route Handlers)
- [ ] Database First (cálculos en PostgreSQL)
- [ ] Feature First (organización por funcionalidad)
- [ ] No dependencias innecesarias
- [ ] No código muerto

### Security
- [ ] No secrets en código fuente
- [ ] Rate limiting en rutas públicas
- [ ] Input validation (Zod)
- [ ] SQL parameterized (Supabase client)
- [ ] CORS configurado
- [ ] Headers seguros (middleware.ts)

### Performance
- [ ] Bundle < 200KB initial
- [ ] No N+1 queries
- [ ] Paginación en listas
- [ ] Indexes en columnas de filtro
- [ ] Edge Runtime compatible

### Database
- [ ] RLS habilitado en todas las tablas
- [ ] Policies correctas
- [ ] Foreign keys configuradas
- [ ] Indexes adecuados
- [ ] created_at/updated_at en todas las tablas

### Business Logic
- [ ] Free tier: 30 días, 10 predicciones, solo 2 cifras
- [ ] Premium: ilimitado, 2+3+4 cifras + Redoblona
- [ ] Admin: `estudiowebpin@gmail.com`
- [ ] Predicciones deterministas (sin Math.random)
- [ ] Scraping: 5 fuentes, fallback, idempotencia

### SEO
- [ ] Metadata completa (title, description, keywords)
- [ ] JSON-LD schemas
- [ ] Sitemap.xml generado
- [ ] Robots.txt correcto
- [ ] Canonical URLs
- [ ] Google verification

### Deploy
- [ ] `.vercelignore` optimizado
- [ ] `vercel.json` correcto
- [ ] Cron jobs configurados
- [ ] Environment variables en Vercel
- [ ] CRON_SECRET configurado

## Test Commands
```bash
# Build completo
npm run build

# Lint
npm run lint

# TypeScript check
npx tsc --noEmit

# Deploy a producción
npm run deploy
```

## Post-Deploy Verification
- [ ] Home page carga (< 3s)
- [ ] Login funciona
- [ ] Predicciones generan correctamente
- [ ] Scraping ejecuta (cron manual)
- [ ] Webhook recibe pagos
- [ ] Push notifications envían
- [ ] SEO: sitemap.xml accesible
- [ ] SEO: robots.txt accesible

## Monitoring
- Vercel Dashboard → Functions
- Supabase Dashboard → Logs
- Google Search Console
- cron-job.org → Execution History
