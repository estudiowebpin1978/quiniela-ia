# SECURITY.md — Quiniela IA

## OWASP Top 10 — Protecciones

| # | Vulnerabilidad | Mitigación |
|---|----------------|------------|
| A01 | Broken Access Control | RLS + Server-side validation |
| A02 | Cryptographic Failures | HTTPS + env vars + no secrets in code |
| A03 | Injection | Parameterized queries (Supabase client) |
| A04 | Insecure Design | Threat modeling + least privilege |
| A05 | Security Misconfiguration | Secure headers (middleware.ts) |
| A06 | Vulnerable Components | Regular `npm audit` + updates |
| A07 | Auth Failures | Supabase Auth + JWT + session expiry |
| A08 | Data Integrity | HMAC + webhook signature verification |
| A09 | Logging Failures | Structured logging (lib/logger.ts) |
| A10 | SSRF | No user-controlled URLs in server requests |

## Supabase Security

### RLS (Row Level Security)
```sql
-- SIEMPRE habilitar RLS en todas las tablas
ALTER TABLE draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_predictions ENABLE ROW LEVEL SECURITY;

-- Policy: Usuarios solo ven sus propios datos
CREATE POLICY "users_own_data" ON user_predictions
  FOR ALL USING (user_id = auth.uid());

-- Policy: Lectura pública para draws
CREATE POLICY "public_read_draws" ON draws
  FOR SELECT USING (true);
```

### Secrets Management
```ts
// SIEMPRE usar variables de entorno
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// NUNCA exponer en frontend
// ❌ const key = "sbp_xxx" en componentes cliente
// ✅ Solo en Route Handlers y middleware
```

## Rate Limiting
```ts
// Sliding window: 100 requests per 60 seconds
const RATE_LIMIT = { max: 100, windowSec: 60 };

// Aplicar en todas las rutas públicas
app/api/predictions — 10 req/min
app/api/analisis — 20 req/min
app/api/cron-* — 1 req/min (solo cron-job.org)
```

## Headers Seguros
```ts
// middleware.ts
{
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload"
}
```

## Input Validation
```ts
// SIEMPRE validar en servidor
import { z } from "zod";

const PredictionSchema = z.object({
  turno: z.enum(["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  numbers: z.array(z.number().int().min(0).max(99)).min(1).max(40)
});

// Nunca confiar en datos del cliente
const validated = PredictionSchema.parse(req.body);
```

## SQL Injection Prevention
```ts
// SIEMPRE usar Supabase client
await supabase.from("draws").select().eq("turno", turno);

// NUNCA concatenar strings SQL
// ❌ `SELECT * FROM draws WHERE turno = '${turno}'`
// ✅ .eq("turno", turno)
```

## CSRF Protection
```ts
// Tokens en formularios
// SameSite cookies
// Origin validation en webhooks
const origin = req.headers.get("origin");
if (origin !== "https://quiniela-ia-two.vercel.app") {
  return new Response("Unauthorized", { status: 401 });
}
```

## Webhook Security
```ts
// Validar firma HMAC en webhooks de pago
const signature = req.headers.get("x-signature");
const expected = crypto.createHmac("sha256", webhookSecret)
  .update(body)
  .digest("hex");

if (signature !== expected) {
  return new Response("Invalid signature", { status: 401 });
}
```
