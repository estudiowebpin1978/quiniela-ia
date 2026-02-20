# 🔧 Scripts de Verificación y Diagnóstico

Herramientas automatizadas para diagnosticar problemas en el setup de desarrollo y testing.

## 📋 Scripts Disponibles

### 1. **`npm run verify:env`**
   - **Verifica:** Variables de entorno, dependencias, archivos de configuración
   - **Cuándo usar:** Primero, al comenzar desarrollo o después de cambios env
   - **Tiempo:** ~2 segundos

```bash
npm run verify:env
```

**Valida:**
- ✅ `.env.local`, `.env.test`, `.env.example` existen
- ✅ Variables Supabase configuradas (URL, keys)
- ✅ Dependencias críticas instaladas
- ✅ Archivos config presentes (playwright, next, tsconfig)
- ✅ Directorio `data/` y archivos de base de datos
- ✅ Tests E2E resources (`e2e/full-flow.spec.ts`)
- ✅ Scripts npm disponibles

---

### 2. **`npm run verify:supabase`**
   - **Verifica:** Conectividad y configuración de Supabase
   - **Cuándo usar:** Después de cambiar variables Supabase o levantar Supabase local
   - **Requiere:** `npm run dev` corriendo O Supabase local levantada
   - **Tiempo:** ~3-5 segundos

```bash
npm run verify:supabase
```

**Valida:**
- ✅ Variables Supabase presentes (URL, keys)
- ✅ Conectividad HTTP (GET a REST API)
- ✅ Cliente Supabase JS funciona
- ✅ Tabla `draws` existe
- ✅ Tabla tiene datos (o advierte si está vacía)

**Problemas comunes que detecta:**
- ❌ Supabase remota pausada → "fetch failed"
- ❌ Supabase local no levantada → "ECONNREFUSED"
- ❌ URL HTTP sin `NODE_TLS_REJECT_UNAUTHORIZED=0` → TLS error
- ❌ Keys inválidas → Error 401/403
- ❌ Tabla no existe → "table not found"

---

### 3. **`npm run verify:api`**
   - **Verifica:** Endpoints API responden correctamente
   - **Cuándo usar:** Después de cambios en endpoints, antes de tests, antes de deploy
   - **Requiere:** `npm run dev` corriendo en otra terminal
   - **Tiempo:** ~2-3 segundos

```bash
# Terminal 1: Levanta servidor
npm run dev

# Terminal 2: Verifica endpoints
npm run verify:api
```

**Valida:**
- ✅ GET `/api/predictions?turno=Mañana&premium=0`
  - Status 200
  - Properties: `two`, `three`, `four` existen
  - Todos son arrays (nunca undefined)
  
- ✅ GET `/api/pending`
  - Status 200
  - Respuesta es array
  
- ✅ POST `/api/init-db`
  - Status 200
  - Endpoint funciona

**Errores que detecta:**
- ❌ Status 500 en endpoints
- ❌ Propiedades faltantes o undefined
- ❌ Arrays no son arrays (undefined, etc)
- ❌ Servidor no accesible (ECONNREFUSED)

---

### 4. **`npm run verify:all`**
   - **Verifica:** Todo lo anterior en secuencia
   - **Cuándo usar:** Antes de cada tarea importante (tests, deploy)
   - **Tiempo:** ~10-15 segundos

```bash
npm run verify:all
```

---

## 🚀 Flujo de Diagnóstico Completo

### Escenario 1: Configurar ambiente por primera vez

```bash
# 1. Instalar dependencias
npm install

# 2. Verificar ambiente
npm run verify:env

# 3. Si dice todo OK, siguiente...
# Si hay errores, revisa DIAGNOSTICO.md
```

### Escenario 2: Supabase remota

```bash
# 1. Asegura que .env.local tiene keys correctas
cat .env.local | grep SUPABASE

# 2. Verifica conectividad
npm run verify:supabase

# Si falla:
#   - Ve a https://app.supabase.com
#   - Verifica que proyecto NO esté "Paused"
#   - Si está pausado, haz click en "Resume"
#   - Espera 30s y reintenta
```

### Escenario 3: Desarrollo local con Supabase

```bash
# Terminal 1: Levanta Supabase local
npx supabase start
npx supabase status  # Ver keys

# Copia las keys a .env.test

# Terminal 2: Levanta servidor Next.js
npm run dev

# Terminal 3: Verifica todo
npm run verify:all
```

### Escenario 4: Tests E2E

```bash
# Terminal 1: Levanta Supabase
npx supabase start

# Terminal 2: Verifica Supabase
npm run verify:supabase

# Terminal 3: Verifica endpoints
npm run verify:api

# Terminal 4: Ejecuta tests
npm run test:e2e

# Detalle interactivo:
npm run test:e2e:ui

# Ver reporte
npm run test:e2e:report
```

---

## 🔍 Interpretar Resultados

### ✅ Todo Verde

```
✅ ¡Ambiente listo! Puedes ejecutar:
  - Desarrollo: npm run dev
  - Tests E2E: npm run test:e2e
```

→ Procede con confianza, el setup está OK.

### ⚠️ Avisos (Amarillo)

```
⚠️ Tabla vacía
💡 Solución: Ejecuta /api/init-db para poblar datos
```

→ No es crítico inmediatamente, pero afectará tests. Ejecuta la sugerencia.

### ❌ Errores (Rojo)

```
❌ Tabla "draws" no existe
💡 Solución: 
  1. Ejecuta: curl http://localhost:3000/api/init-db
  2. O copia SQL en Supabase Studio: supabase-create-draws-table.sql
```

→ **CRÍTICO.** No continúes sin resolver. Sigue sugerencias del script.

---

## 📋 Troubleshooting por Síntoma

### "TypeError: fetch failed"

```bash
npm run verify:supabase
# Verá el problema específico (TLS, ECONNREFUSED, etc)

# Soluciones:
# 1. Si es "ECONNREFUSED" → npx supabase start
# 2. Si es TLS → NODE_TLS_REJECT_UNAUTHORIZED=0 en .env.local o .env.test
# 3. Si es "Paused" → Resume en Supabase dashboard → Espera 30s
```

### "Cannot read property 'length' of undefined"

```bash
npm run verify:api
# Verá que propiedades están faltando

# Solución: Revisa /api/predictions en app/api/predictions/route.js
# Asegúrate de que siempre retorna:
# { two: [], three: [], four: [] }  (nunca undefined)
```

### Tests E2E fallan

```bash
# Terminal 1
npx supabase start
npm run verify:supabase

# Terminal 2
npm run dev
npm run verify:api

# Terminal 3
npm run test:e2e:ui  # Interfaz interactivo para debug
```

---

## 🎯 Pre-Deploy Checklist

Antes de desplegar, ejecuta:

```bash
# 1. Verificar ambiente
npm run verify:env
# → Debe pasar todo (✅)

# 2. Verificar Supabase (si usas remota)
npm run verify:supabase
# → Debe pasar, tabla debe tener datos (✅)

# 3. Verificar endpoints
npm run dev
# (en otra terminal)
npm run verify:api
# → Todos endpoints deben estar OK (✅)

# 4. Tests E2E (opcional pero recomendado)
npx supabase start
npm run test:e2e
# → Todos tests deben pasar (✅)

# 5. Build
npm run build
# → "Compiled successfully" (✅)

# 6. Lint
npm run lint
# → 0 errors (✅)
```

Si TODO está verde (✅), estás listo para deploy.

---

## 📞 Contacto y Soporte

Si un script falla de manera inesperada:

1. **Lee el mensaje de error** en la terminal
2. **Consulta DIAGNOSTICO.md** (guía completa)
3. **Revisa logs:**
   - Next.js: terminal donde corre `npm run dev`
   - Playwright: `npm run test:e2e:report`

