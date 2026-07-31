# BUSINESS_RULES.md — Quiniela IA

## Quiniela Nacional

### Turnos
| Turno | Horario Sorteo | Hora Máx Predicción |
|-------|----------------|---------------------|
| Previa | 12:00 PM | 11:59 AM |
| Primera | 1:00 PM | 12:59 PM |
| Matutina | 6:00 PM | 5:59 PM |
| Vespertina | 8:00 PM | 7:59 PM |
| Nocturna | 10:00 PM | 9:59 PM |

### Cifras
| Tipo | Descripción | Precio |
|------|-------------|--------|
| 2 cifras | 2 últimos dígitos | Free/Premium |
| 3 cifras | 3 últimos dígitos | Premium |
| 4 cifras | 4 últimos dígitos | Premium |
| Redoblona | 2 cifras + 1 reversal | Premium |

### Games
```ts
const GAMES = {
  QUINIELA_NACIONAL: "ac593199-c299-4f03-b1b7-8675fe4fa6d9",
  LOTO: "loto-game-id"
};
```

## Planes

### Free
- Trial: 30 días desde registro
- Predicciones: 10 máximo
- Cifras: Solo 2
- Funciones: Predicciones básicas, historial

### Premium
- Precio: Definido por admin
- Predicciones: Ilimitadas
- Cifras: 2, 3, 4 + Redoblona
- Funciones: Análisis avanzado, IA, todos los turnos

### Admin
- Email: `estudiowebpin@gmail.com`
- Acceso: Ilimitado
- Funciones: Gestión de pagos, configuración

## Validación de Tiers

### Server-Side (lib/auth/tier.ts)
```ts
function resolveUserTier(profile: UserProfile): "free" | "premium" | "admin" {
  if (isAdminEmail(profile.email)) return "admin";
  if (profile.premium_until && new Date(profile.premium_until) > new Date()) return "premium";
  return "free";
}
```

### SQL (check_prediction_tier trigger)
```sql
CREATE OR REPLACE FUNCTION check_prediction_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cifras > 2 AND NOT is_premium(NEW.user_id) THEN
    RAISE EXCEPTION 'Free tier only allows 2-cifras';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Predicciones

### Pipeline
1. Sync → Verificar datos frescos
2. Score → Calcular frecuencias, Markov, entropía
3. Monte Carlo → 10,000 simulaciones deterministas
4. Genetic Algorithm → Optimizar pesos
5. Merge → Combinar scores
6. ML Models → Random Forest, Neural Network
7. Final → Top 20 números

### Determinismo
- **NUNCA usar Math.random()**
- Usar `lib/math/seeded-rng.ts` (xorshift32)
- Pesos genéticos: mismos inputs → mismos outputs
- Monte Carlo: semilla fija por turno+fecha

### Cache
- **Scores**: 15 minutos (globalThis + Supabase)
- **Predictions**: 24 horas
- **Analytics**: 6 horas
- **Rate limits**: 60 segundos

## Scraping

### Fuentes
1. `quinielistaok.com` — Fuente primaria
2. `loteriasyapuestas.es` — Fuente secundaria
3. `agenciaelonenueve.com` — Fuente terciaria
4. Otros parsers — Fallback adicional

### Pipeline
```ts
const SCRAPERS = [
  parserQuinielaScraping,    // HTML parsing
  parserLoteriasNacionales,  // API/HTML
  parserAgenciaEl169,        // HTML parsing
  parserNoticiasDelTenis     // HTML parsing
];
```

### Validación
- Mínimo 20 números por turno
- Hash del HTML para deduplicación
- Confidence score (0.0 - 1.0)
- Timestamp de verificación

## Pagos

### Ualá Bis
- Webhook: `/api/webhook-uala`
- Eventos: `payment.created`, `payment.confirmed`
- Validación: HMAC signature

### Estados
- `pending` → Pago recibido, verificando
- `confirmed` → Pago verificado, premium activado
- `failed` → Pago fallido
- `refunded` → Reembolsado

## Push Notifications

### Eventos
- `prediction_ready` → Predicción lista
- `draw_results` → Resultados disponibles
- `premium_expiry` → Trial por expirar
- `payment_confirmed` → Pago confirmado

### Web Push
- VAPID keys para autenticación
- Suscripciones guardadas en `push_subscriptions`
- Envío via `cron-push` route
