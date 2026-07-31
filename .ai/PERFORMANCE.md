# PERFORMANCE.md — Quiniela IA

## Vercel

### Cold Start
- Target: < 500ms
- Strategy: Edge Runtime para middleware, Serverless para API
- Optimization: Minimal dependencies, tree-shaking, code splitting

### Bundle Size
- Target: < 200KB JS initial load
- Strategy: Dynamic imports, lazy loading, code splitting
- Monitoring: `next build` output, Vercel Analytics

### Static Generation
- Páginas estáticas: /pronostico/[fecha], /resultado/[fecha], /sitemap.xml, /robots.txt
- Target: < 2s build time por página
- Strategy: `generateStaticParams` + `revalidate`

## Supabase

### Query Performance
- Target: < 100ms per query
- Strategy: Índices adecuados, RPC para cálculos complejos
- Monitoring: Supabase Dashboard → Database → Query Performance

### Connection Pooling
- Use Supabase managed pooling
- No persistent connections from Vercel

### RLS Performance
```sql
-- SIEMPRE crear índices para RLS policies
CREATE INDEX idx_user_predictions_user_id ON user_predictions (user_id);
CREATE INDEX idx_user_profiles_email ON user_profiles (email);
```

### Materialized Views
```sql
-- Para cálculos frecuentes y pesados
CREATE MATERIALIZED VIEW mv_turno_stats AS
SELECT turno, COUNT(*), AVG(numbers) FROM draws GROUP BY turno;
-- Refrescar en cron-analytics
```

## TypeScript

### Compilation
- Target: ES2022
- Strict mode: always
- No `any`, no `ts-ignore`

### Tree Shaking
- Named exports siempre
- Barrel exports solo cuando mejoren DX
- No re-exports innecesarios

## React

### Re-renders
```ts
// SIEMPRE memorizar componentes pesados
const PredictionCard = React.memo(function PredictionCard({ data }: Props) { ... });

// SIEMPRE usar useCallback para funciones en dependencias
const handleClick = useCallback(() => { ... }, [deps]);

// SIEMPRE usar useMemo para cálculos pesados
const sorted = useMemo(() => data.sort(...), [data]);
```

### Code Splitting
```ts
// Dynamic imports para componentes pesados
const MiNumeroAnalyzer = dynamic(
  () => import("@/components/seo/MiNumeroAnalyzer"),
  { loading: () => <Skeleton /> }
);
```

## Database

### N+1 Prevention
```ts
// ❌ N+1 queries
const draws = await supabase.from("draws").select();
for (const draw of draws) {
  const stats = await supabase.from("stats").eq("draw_id", draw.id);
}

// ✅ Join or batch
const draws = await supabase.from("draws").select("*, stats(*)");
// OR
const drawIds = draws.map(d => d.id);
const stats = await supabase.from("stats").in("draw_id", drawIds);
```

### Query Optimization
```ts
// SIEMPRE select only needed columns
await supabase.from("draws").select("id, date, turno, numbers");

// SIEMPRE use .single() for single rows
await supabase.from("draws").eq("id", id).single();

// SIEMPRE paginate large datasets
await supabase.from("draws").range(0, 99).order("date", { ascending: false });
```

## Edge Runtime

### Compatibilidad
- No `fs`, no `path`, no Node.js APIs
- No `crypto` async (use Web Crypto)
- No `Buffer` (use `Uint8Array`)
- No dynamic imports in middleware

### Checklist
- [ ] No Node.js APIs
- [ ] No fs/path
- [ ] Uses Web Crypto
- [ ] Uses Uint8Array
- [ ] No dynamic imports in middleware

## Monitoring

### Vercel
- Functions → invocations, errors, duration
- Analytics → Web Vitals, FCP, LCP
- Speed Insights → Core Web Vitals

### Supabase
- Dashboard → Database → Query Performance
- Dashboard → Logs → Postgres
- Dashboard → API → Request Logs

## Alerts
```ts
// Supabase RPC para alertas
CREATE OR REPLACE FUNCTION check_slow_queries()
RETURNS TABLE (query TEXT, duration_ms INTEGER) AS $$
SELECT query, duration_ms FROM pg_stat_statements
WHERE duration_ms > 1000 ORDER BY duration_ms DESC LIMIT 10;
$$ LANGUAGE sql;
```
