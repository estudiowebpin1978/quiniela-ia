# TASK_TEMPLATE.md — Quiniela IA

## Plantilla para Nuevas Tareas

### 1. Auditoría Técnica
```bash
# Verificar estado actual
npm run lint
npm run build
git status
git diff
```

### 2. Problemas Encontrados
| # | Problema | Severidad | Archivo | Línea |
|---|----------|-----------|---------|-------|
| 1 | [Descripción] | Alta/Media/Baja | [archivo] | [línea] |

### 3. Riesgos
| # | Riesgo | Impacto | Probabilidad | Mitigación |
|---|--------|---------|--------------|------------|
| 1 | [Riesgo] | Alto/Medio/Bajo | Alta/Media/Baja | [Mitigación] |

### 4. Plan de Refactor
| # | Acción | Archivos | Dependencias |
|---|--------|----------|--------------|
| 1 | [Acción] | [Archivos] | [Dependencias] |

### 5. SQL
```sql
-- Nuevas tablas/índices/RPCs
CREATE TABLE ...
CREATE INDEX ...
CREATE OR REPLACE FUNCTION ...
```

### 6. TypeScript
```ts
// Nuevas interfaces/tipos
interface Foo { ... }

// Nuevas funciones
function bar(): void { ... }
```

### 7. Middleware
```ts
// Headers de seguridad
// Rate limiting
// CORS
// Auth validation
```

### 8. Server Actions
```ts
"use server";
// Server actions para forms
```

### 9. Route Handlers
```ts
// app/api/xxx/route.ts
export async function GET(req: Request) { ... }
export async function POST(req: Request) { ... }
```

### 10. RPC
```sql
-- Supabase RPCs
CREATE OR REPLACE FUNCTION xxx() RETURNS ... AS $$
BEGIN
  ...
END;
$$ LANGUAGE plpgsql;
```

### 11. Testing
```bash
# Verificar cambios
npm run lint
npm run build
# Tests específicos
```

### 12. Seguridad
- [ ] RLS habilitado
- [ ] Input validado (Zod)
- [ ] SQL parameterized
- [ ] Rate limiting aplicado
- [ ] No secrets expuestos
- [ ] CORS configurado
- [ ] Headers seguros

### 13. Rendimiento
- [ ] No N+1 queries
- [ ] Paginación implementada
- [ ] Índices creados
- [ ] Cache configurado
- [ ] Edge Runtime compatible
- [ ] Bundle < 200KB

### 14. Checklist Final
- [ ] TypeScript: 0 errores
- [ ] ESLint: 0 errores, 0 warnings
- [ ] Build: exitoso
- [ ] Deploy: exitoso
- [ ] Funcionalidad: verificada
- [ ] Seguridad: verificada
- [ ] Rendimiento: aceptable
- [ ] SEO: actualizado (si aplica)
- [ ] Documentación: actualizada (si aplica)

---

## Ejemplo de Uso

### Tarea: Agregar validación de email

#### 1. Auditoría Técnica
- [x] `npm run lint` → 0 errores
- [x] `npm run build` → exitoso

#### 2. Problemas Encontrados
| # | Problema | Severidad | Archivo | Línea |
|---|----------|-----------|---------|-------|
| 1 | Sin validación de email | Alta | lib/auth.ts | 45 |

#### 3. Riesgos
| # | Riesgo | Impacto | Probabilidad | Mitigación |
|---|--------|---------|--------------|------------|
| 1 | Emails inválidos en DB | Alto | Media | Validación Zod |

#### 4. Plan de Refactor
| # | Acción | Archivos | Dependencias |
|---|--------|----------|--------------|
| 1 | Agregar schema Zod | lib/auth.ts | Ninguna |
| 2 | Validar en route handler | app/api/login/route.ts | 1 |

#### 5. SQL
```sql
-- No se requiere
```

#### 6. TypeScript
```ts
import { z } from "zod";

const EmailSchema = z.string().email();

function validateEmail(email: string): string {
  return EmailSchema.parse(email);
}
```

#### 7-10. [N/A para esta tarea]

#### 11. Testing
```bash
npm run lint
npm run build
```

#### 12. Seguridad
- [x] Input validado (Zod)
- [x] No secrets expuestos

#### 13. Rendimiento
- [x] No afecta rendimiento

#### 14. Checklist Final
- [x] TypeScript: 0 errores
- [x] ESLint: 0 errores
- [x] Build: exitoso
- [x] Deploy: exitoso
- [x] Funcionalidad: verificada
