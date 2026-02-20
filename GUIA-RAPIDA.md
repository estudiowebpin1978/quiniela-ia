# ⚡ Guía Rápida - Diagnóstico y Soluciones

Comienza aquí para resolver problemas rápidamente.

---

## 🎯 Paso 1: Verificar Ambiente (2 min)

```bash
npm run verify:env
```

**Resultado esperado:** Todos ✅ (verde)

Si falla algo:
- ❌ `.env.local` falta → Copia `.env.example` a `.env.local` y llena valores
- ❌ Dependencias faltan → `npm install`

---

## 🎯 Paso 2: Verificar Supabase (3 min)

### Opción A: Supabase Remota

```bash
npm run verify:supabase
```

**Si falla "fetch failed":**
```bash
# 1. Ve a https://app.supabase.com
# 2. Selecciona tu proyecto
# 3. Busca "Project Status" → Si está "Paused", click "Resume"
# 4. Espera 30s y reintenta
npm run verify:supabase
```

### Opción B: Supabase Local

```bash
# Terminal 1: Levanta Supabase
npx supabase start
npx supabase status

# Copia las keys y pega en .env.test
# NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...

# Terminal 2: Verifica
npm run verify:supabase
```

**Resultado esperado:** ✅ "Verificación completada"

---

## 🎯 Paso 3: Verificar Endpoints (3 min)

```bash
# Terminal 1: Levanta servidor Next.js
npm run dev

# Terminal 2: Verifica endpoints
npm run verify:api
```

**Resultado esperado:** ✅ Todos los endpoints OK

**Si falla ALGUNO:**
- Revisa logs en Terminal 1 (npm run dev)
- Lee error detallado en Terminal 2
- Consulta sección "Errores Comunes" abajo

---

## 🎯 Paso 4: Ejecutar Tests E2E (5-10 min)

```bash
# Terminal 1: Supabase local
npx supabase start

# Terminal 2: Servidor Next.js
npm run dev

# Terminal 3: Tests E2E
npm run test:e2e

# O con interfaz interactiva:
npm run test:e2e:ui

# Ver reporte:
npm run test:e2e:report
```

---

## ❌ Errores Comunes

### Error: `TypeError: fetch failed`

```bash
# Si es local:
# Añade a .env.local o .env.test:
NODE_TLS_REJECT_UNAUTHORIZED=0

# Reinicia servidor:
npm run dev
```

---

### Error: `ECONNREFUSED 127.0.0.1:54321`

```bash
# Supabase no está levantada
npx supabase start
npx supabase status
```

---

### Error: `Cannot read property 'length' of undefined`

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run verify:api

# Verifica que respuestas tengan siempre arrays:
# { two: [], three: [], four: [] }
# (nunca undefined)
```

---

### Error: `PGRST003 - table not found`

```bash
# Tabla 'draws' no existe

# Solución 1: Ejecutar inicialización
npm run dev
# En otra terminal:
curl -X POST http://localhost:3000/api/init-db

# Solución 2: SQL manual en Supabase Studio
# Copia y ejecuta: supabase-create-draws-table.sql
```

---

### Error: Tests fallan con "Playwright browsers not installed"

```bash
npx playwright install
```

---

## 📋 Flujos Rápidos

### Para DESARROLLO

```bash
npm run dev                      # Levanta servidor
npm run verify:api               # En otra terminal, verifica endpoints
npm run lint                     # Valida código
npm run build                    # Test build
```

### Para TESTING E2E

```bash
npx supabase start               # Terminal 1
npm run verify:supabase          # Terminal 2: Verifica Supabase
npm run dev                      # Terminal 3: Levanta servidor
npm run test:e2e                 # Terminal 4: Ejecuta tests
# o interactivo:
npm run test:e2e:ui
```

### Pre-DEPLOY

```bash
npm run verify:all               # Verificar todo
npm run lint                     # Linting: 0 errors
npm run build                    # Build: success
npm run test:e2e                 # Tests: all passing
# Si todo verde (✅), listo para deploy
```

---

## 🔧 Scripts Disponibles

```bash
# Desarrollo
npm run dev                      # Servidor Next.js
npm run build                    # Build producción
npm run start                    # Iniciar app (requiere npm run build)
npm run lint                     # ESLint

# Verificación
npm run verify:env               # Verificar variables y dependencias
npm run verify:supabase          # Verificar Supabase
npm run verify:api               # Verificar endpoints
npm run verify:all               # Todas las verificaciones

# Testing
npm run test:e2e                 # Tests con Playwright
npm run test:e2e:ui              # Tests interactivos
npm run test:e2e:debug           # Debug mode
npm run test:e2e:report          # Ver reporte HTML
```

---

## 📖 Documentación Completa

- **[DIAGNOSTICO.md](DIAGNOSTICO.md)** - Guía completa de diagnóstico paso a paso
- **[scripts/README.md](scripts/README.md)** - Explicación detallada de cada script
- **[DEPLOY.md](DEPLOY.md)** - Opciones de deploy
- **[PRE-DEPLOY-CHECKLIST.md](PRE-DEPLOY-CHECKLIST.md)** - Verificaciones antes de producción

---

## ✅ Resumen Rápido

| Si necesitas... | Ejecuta... |
|----------------|-----------|
| Verificar ambiente | `npm run verify:env` |
| Revisar Supabase | `npm run verify:supabase` |
| Revisar endpoints | `npm run verify:api` |
| Revisar TODO | `npm run verify:all` |
| Tests E2E | `npm run test:e2e` |
| Debug de tests | `npm run test:e2e:ui` |
| Build producción | `npm run build` |
| Buscar problemas | Lee [DIAGNOSTICO.md](DIAGNOSTICO.md) |

