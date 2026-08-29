# CODING_STYLE.md — Quiniela IA

## TypeScript Strict
```ts
// SIEMPRE usar tipos explícitos
interface DrawRow {
  id: string;
  date: string;
  turno: string;
  numbers: number[];
}

// NUNCA usar any
// ❌ const data: any = await fetch(...)
// ✅ const data: DrawRow = await fetch(...)

// Usar unknown cuando el tipo sea realmente desconocido
function parseJSON(input: string): unknown {
  return JSON.parse(input);
}
```

## Naming Conventions
| Tipo | Convención | Ejemplo |
|------|------------|---------|
| Variables | camelCase | `drawDate`, `turnoName` |
| Funciones | camelCase | `getDraws()`, `calculateScore()` |
| Interfaces | PascalCase | `DrawRow`, `MonteCarloResult` |
| Componentes | PascalCase | `PredictionCard`, `NumberTile` |
| Archivos | kebab-case | `prediction-card.tsx`, `factores30.ts` |
| CSS Variables | kebab-case | `--text-primary`, `--glass-bg` |
| SQL | snake_case | `user_profiles`, `check_rate_limit` |

## Funciones
```ts
// Preferir funciones puras
function calculateEntropy(data: number[]): number { ... }

// Evitar efectos secundarios innecesarios
// ❌ function processData() { globalThis.cache = {}; }
// ✅ function processData(): Result { ... }

// Usar early returns
function getScore(n: number): number {
  if (n <= 0) return 0;
  if (n >= 100) return 100;
  return n * 0.5;
}
```

## Imports
```ts
// SIEMPRE usar path aliases
import { getSupabaseAdmin } from "@/lib/supabase-client";
import { DrawRow } from "@/app/api/predictions/types";

// NUNCA usar imports relativos profundos
// ❌ import { foo } from "../../../lib/foo"
// ✅ import { foo } from "@/lib/foo"
```

## Exports
```ts
// Named exports siempre
export function getDraws(): Promise<DrawRow[]> { ... }
export type { DrawRow, MonteCarloResult };

// Default exports solo para React components y pages
export default function HomePage() { ... }
```

## Error Handling
```ts
// Usar errores tipados
class ScraperError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "ScraperError";
  }
}

// Nunca ignorar errores
// ❌ try { await fetch() } catch {}
// ✅ try { await fetch() } catch (e) { logger.error("Fetch failed", e); }
```

## Async/Await
```ts
// Preferir async/await sobre .then()
async function getDraws(): Promise<DrawRow[]> {
  const data = await supabase.from("draws").select();
  return data;
}

// Manejar errores con try/catch
try {
  await riskyOperation();
} catch (e) {
  handleError(e);
}
```

## Comments
```ts
// NO agregar comentarios explicativos
// ❌ // This function calculates the entropy
// ✅ function calculateEntropy(data: number[]): number { ... }

// SI agregar comentarios de:
// - Warning de seguridad
// - Workaround temporal
// - Decisión de arquitectura no obvia
```
