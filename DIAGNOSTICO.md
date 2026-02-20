# 🔧 Guía de Diagnóstico y Soluciones - Quiniela IA

Una guía paso a paso para diagnosticar y resolver problemas comunes en desarrollo y testing.

---

## 📋 Tabla de Contenidos

1. [Verificar Entorno y Conexión a Supabase](#1-verificar-entorno-y-conexión-a-supabase)
2. [Comprobar Inicialización de BD](#2-comprobar-inicialización-de-bd)
3. [Corregir Endpoints de API](#3-corregir-endpoints-de-api)
4. [Configurar Tests E2E](#4-configurar-tests-e2e)
5. [Troubleshooting Rápido](#troubleshooting-rápido)
6. [Verificación de Ambiente](#verificación-de-ambiente)

---

## 1. Verificar Entorno y Conexión a Supabase

### ✅ Paso 1: Revisar variables de entorno

**Archivo:** `.env.local`

```bash
# Supabase (remota o local)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Para desarrollo con Supabase local:
# NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
# NODE_TLS_REJECT_UNAUTHORIZED=0
```

**Verificar:**
```bash
# 1. Archivo existe
test -f .env.local && echo "✅ .env.local existe" || echo "❌ Falta .env.local"

# 2. Variables cargadas
grep SUPABASE_URL .env.local
grep SUPABASE_ANON_KEY .env.local
```

### ✅ Paso 2: Validar conectividad con Supabase

**Opción A: Supabase Remota**
```bash
# Verifica que el proyecto no esté pausado
# 1. Ve a https://app.supabase.com
# 2. Selecciona tu proyecto
# 3. Busca "Project Status" en Settings
# 4. Si está "Paused", haz clic en "Resume"
# 5. Espera ~30s y recarga
```

**Opción B: Supabase Local**
```bash
# Iniciar Supabase
npx supabase start

# Verificar estado
npx supabase status

# Salida esperada:
# Supabase local development setup is running
# API URL: http://localhost:54321
```

**Opción C: Verificar conectividad programáticamente**
```bash
# Ejecutar script de verificación
node scripts/verify-supabase.js

# O test manual en Node
node -e "
import('node-fetch').then(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  console.log('Testing:', url);
  fetch(url + '/rest/v1/', {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
  }).then(r => console.log('✅ Status:', r.status))
    .catch(e => console.log('❌ Error:', e.message));
});
"
```

### ✅ Paso 3: Configurar TLS para conexiones inseguras (solo desarrollo)

Si obtienes `TypeError: fetch failed` con Supabase local HTTP:

```bash
# En .env.local, añade:
NODE_TLS_REJECT_UNAUTHORIZED=0

# ⚠️ SOLO para desarrollo local
# NUNCA en producción
```

Luego reinicia el servidor:
```bash
npm run dev
```

---

## 2. Comprobar Inicialización de BD

### ✅ Paso 1: Verificar tabla `draws`

**En consola de Supabase (Studio):**
1. Abre https://app.supabase.com
2. Selecciona tu proyecto
3. Navega a "SQL Editor"
4. Ejecuta:

```sql
SELECT COUNT(*) as total_rows FROM draws;
SELECT DISTINCT turno FROM draws LIMIT 5;
```

**Esperado:** Mínimo 1 fila, con turnos como "Mañana", "Tarde", "Noche"

### ✅ Paso 2: Ejecutar inicialización de API

```bash
# Levanta el servidor
npm run dev

# En otra terminal, ejecuta:
curl http://localhost:3000/api/init-db

# Respuesta esperada (201 o 200):
# {"success": true, "message": "..."}

# O desde Node:
node -e "
fetch('http://localhost:3000/api/init-db', { method: 'POST' })
  .then(r => r.json())
  .then(d => console.log(JSON.stringify(d, null, 2)))
  .catch(e => console.error('Error:', e.message));
"
```

**Si falla (500):**

1. Revisa logs de Next.js:
```bash
# En terminal donde corre npm run dev
# Busca líneas con ERROR o stack trace
```

2. Verifica permisos en Supabase:
   - Ve a "Authentication" → "Policies"
   - Asegúrate que exista una política de INSERT en tabla `draws`

3. Intenta repoblar manualmente:
```bash
# Usando el script de Supabase
npm run migrate:db

# O corre el SQL directamente en Studio:
# Ver: supabase-create-draws-table.sql
```

### ✅ Paso 3: Validar datos

```sql
-- En SQL Editor de Supabase Studio:
SELECT 
  turno,
  COUNT(*) as cantidad,
  MIN(created_at) as desde,
  MAX(created_at) as hasta
FROM draws
GROUP BY turno
ORDER BY turno;
```

**Esperado:**
```
turno | cantidad | desde | hasta
------|----------|-------|------
Mañana | 15+ | ... | ...
Tarde | 15+ | ... | ...
Noche | 15+ | ... | ...
```

---

## 3. Corregir Endpoints de API

### ✅ Problema: `/api/predictions` devuelve 500

**Causas comunes:**
- Tabla `draws` vacía
- Filtro por `turno` no coincide
- Propiedades `undefined` en respuesta

**Solución:**

1. **Verificar implementación** → Ver [app/api/predictions/route.js](app/api/predictions/route.js)

2. **Asegurar propiedades siempre existan:**

```javascript
// ❌ ANTES (puede retornar undefined)
return NextResponse.json(data);

// ✅ DESPUÉS (siempre retorna objeto válido)
return NextResponse.json({
  two: data.two || [],
  three: data.three || [],
  four: data.four || [],
  premium: data.premium || false,
  turno: query.turno || 'unknown'
});
```

3. **Añadir manejo de errores:**

```javascript
try {
  const response = await supabase
    .from('draws')
    .select('*')
    .eq('turno', turno);
  
  if (response.error) {
    console.error('Supabase error:', response.error);
    return NextResponse.json(
      { error: 'Database error', details: response.error.message },
      { status: 500 }
    );
  }
  
  if (!response.data || response.data.length === 0) {
    return NextResponse.json({
      two: [], three: [], four: [],
      message: `No data for turno: ${turno}`
    }, { status: 200 });
  }
  
  // Procesar response.data...
} catch (error) {
  console.error('API error:', error);
  return NextResponse.json(
    { error: 'Server error', message: error.message },
    { status: 500 }
  );
}
```

### ✅ Problema: Tests devuelven `undefined` para `.length`

**Causa:** Propiedades no inicializadas

**Solución:** Todos los endpoints deben retornar:

```javascript
{
  two: [] o Array,      // Números de 2 dígitos
  three: [] o Array,    // Números de 3 dígitos
  four: [] o Array,     // Números de 4 dígitos
  premium: Boolean,     // Acceso premium
  turno: String         // Turno solicitado
}
```

Nunca `undefined`.

---

## 4. Configurar Tests E2E

### ✅ Paso 1: Crear `.env.test`

**Archivo:** `.env.test`

```bash
# Supabase Local para Tests
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Permitir conexiones HTTP inseguras en tests
NODE_TLS_REJECT_UNAUTHORIZED=0

# Ambiente
NODE_ENV=test
```

**Obtener keys locales:**
```bash
# Ejecuta Supabase
npx supabase start

# Leer keys:
npx supabase status

# Busca las líneas:
# anon key: ...
# service_role key: ...
```

### ✅ Paso 2: Actualizar `playwright.config.ts`

Ver [playwright.config.ts](playwright.config.ts) - ya está configurado con:

```typescript
webServer: {
  command: `cross-env NODE_ENV=test next dev`,
  url: 'http://localhost:3000',
  timeout: 120000,
  reuseExistingServer: process.env.CI ? false : true,
},
```

### ✅ Paso 3: Secuencia de tests

```bash
# Terminal 1: Iniciar Supabase
npx supabase start
npx supabase status

# Terminal 2: Ejecutar tests E2E
npm run test:e2e

# O con interfaz interactiva para debug:
npm run test:e2e:ui
```

### ✅ Paso 4: Pre-poblar datos en tests

En `e2e/full-flow.spec.ts`, ya existe:

```typescript
test.beforeAll(async () => {
  await axios.post('http://localhost:3000/api/init-db');
  console.log('✅ Database initialized for tests');
});
```

Esto asegura que la tabla `draws` tenga datos antes de cada test.

---

## Troubleshooting Rápido

### ❌ Error: `TypeError: fetch failed`

**Causas:**
1. Supabase remota pausada
2. Supabase local no levantada
3. URL http:// sin `NODE_TLS_REJECT_UNAUTHORIZED=0`

**Solución:**
```bash
# Si es remoto: Reactiva proyecto en Supabase Studio
# Si es local:
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev
```

---

### ❌ Error: `PGRST003 - table not found`

**Causa:** Tabla `draws` no existe

**Solución:**
```bash
# Ejecuta migración
curl -X POST http://localhost:3000/api/init-db

# O manualmente en Supabase Studio:
# Copia y ejecuta: supabase-create-draws-table.sql
```

---

### ❌ Error: `TypeError: Cannot read property 'length' of undefined`

**Causa:** Endpoint retorna propiedades sin inicializar

**Solución:**
```javascript
// Siempre retorna objeto con arrays vacíos como fallback
return NextResponse.json({
  two: data?.two || [],
  three: data?.three || [],
  four: data?.four || []
});
```

---

### ❌ Error: `ECONNREFUSED 127.0.0.1:54321`

**Causa:** Supabase local no está levantada

**Solución:**
```bash
npx supabase start
# Espera ~30s
npx supabase status
```

---

### ❌ Error: Test timeout en Playwright

**Causa:** Servidor Next.js tarda en iniciar

**Solución:**
```typescript
// En playwright.config.ts:
webServer: {
  timeout: 120000,  // ← Aumentar a 2 minutos
}
```

---

### ❌ Error: `Playwright browsers not installed`

**Causa:** Falta ejecutar instalación

**Solución:**
```bash
npx playwright install
```

---

## Verificación de Ambiente

### 🔍 Script de verificación completa

Ejecuta este script para diagnosticar tu setup:

```bash
node scripts/verify-environment.js
```

Verifica:
- ✅ Variables `.env.local` presentes
- ✅ Conexión a Supabase
- ✅ Tabla `draws` existe y tiene datos
- ✅ Endpoints `/api/*` responden
- ✅ Supabase local (si aplica) está levantada

### 🔍 Checklist manual

```bash
# 1. Variables de entorno
grep -E "SUPABASE|NODE_TLS" .env.local

# 2. Supabase remota (verificar en console)
curl -s https://your-project.supabase.co/rest/v1/ \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" | head -c 100

# 3. Supabase local está corriendo
npx supabase status

# 4. Servidor Next.js responde
curl http://localhost:3000

# 5. Endpoint predictions
curl 'http://localhost:3000/api/predictions?turno=Mañana&premium=0'

# 6. Playwright browsers instalados
npx playwright install --dry-run
```

---

## 📎 Referencias y Enlaces

- [Supabase Docs](https://supabase.com/docs)
- [Supabase CLI](https://supabase.com/docs/reference/cli/introduction)
- [Playwright Docs](https://playwright.dev)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
- [Node.js TLS Config](https://nodejs.org/api/tls.html#tls_tls_createconnection_options_callback)

---

## 💡 Tips Finales

1. **Desarrollo local:** Siempre usa Supabase local con `npx supabase start`
2. **Tests:** Ejecuta tests locales ANTES de hacer push a GitHub
3. **Logs:** Revisa SIEMPRE los logs de Next.js cuando hay 500
4. **Git:** Nunca commites `.env.local` (ya está en `.gitignore`)
5. **Secrets:** Configura GitHub Secrets en Settings antes de desplegar

