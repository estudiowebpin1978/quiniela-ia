# 🎰 QUINIELA IA - ARQUITECTURA COMPLETA

## 📋 ÍNDICE RÁPIDO

1. **Páginas principales** - Ubicación y función
2. **Rutas API** - Endpoints y funcionalidad
3. **Base de datos** - Tablas y estructura
4. **Flujos de datos** - Cómo funciona la app
5. **Botón "Controla Jugada"** - Detalles específicos
6. **Carga automática de sorteos** - Sistema de actualización

---

## 🎨 PÁGINAS PRINCIPALES

### 1. **`/` (Home) → `app/page.tsx`**
```typescript
// Redirección simple a /login
useEffect(() => { window.location.href = "/login" }, [])
```
- **Función**: Landing que redirecciona automáticamente
- **Contenido**: Vacío (solo redirect)
- **Usuarios**: Todos (visitantes)

---

### 2. **`/login` → `app/login/page.tsx`** ✅ AUTENTICACIÓN
```typescript
// UI de autenticación con dos tabs
const [tab, setTab] = useState("up")  // "up" = signup, "in" = signin
```

**Características:**
- ✅ Crear cuenta (signup)
- ✅ Iniciar sesión (signin)
- ✅ Validación de email/contraseña
- ✅ Almacenamiento de token en localStorage
- ✅ Redirección a `/predictions` tras autenticación exitosa

**Componentes visuales:**
- Logo: 🎰 Quiniela IA
- Features: Motor estadístico, 5 sorteos, Datos reales, IA
- Badge: "100% GRATIS"
- Botones: "🆕 Crear cuenta" (verde) / "👆 Ya tengo cuenta" (rosa)

**Flujo de datos:**
```
Usuario → Ingresa email/password → POST /api/login
         ↓
Supabase Auth → Verifica/Crea usuario
         ↓
Response: {access_token, refresh_token, user}
         ↓
localStorage: sb-[project]-auth-token
         ↓
Redirect: /predictions
```

---

### 3. **`/predictions` → `app/predictions/page.tsx`** ⚡ PÁGINA PRINCIPAL
```typescript
const [so, setSo] = useState("Nocturna")      // Sorteo seleccionado
const [dg, setDg] = useState(2)               // Dígitos: 2, 3, 4
const [dt, setDt] = useState(null)            // Datos predicción
const [tab, setTab] = useState("pred")        // Tab activo
```

**ELEMENTOS PRINCIPALES:**

#### 🎯 Botón "⚡ Generar Predicción Ahora"
```typescript
// Genera predicciones estadísticas
async function gen() {
  const r = await fetch("/api/predictions?sorteo=" + so, {
    headers: { Authorization: "Bearer " + token }
  })
  const d = await r.json()  // Datos con números, significados, etc
  setDt(d)
}
```
- **Acción**: Obtiene análisis estadístico
- **API**: GET `/api/predictions?sorteo=Nocturna`
- **Response**: Números predichos, significados, redoblona, heatmap, etc.

#### 🎯 BOTÓN CRÍTICO: "🎯 Controla Jugada" ⭐
```typescript
async function controlarJugada() {
  if (!dt?.numeros?.length) {
    alert("Primero genera una prediccion")
    return
  }
  setControlando(true)
  
  try {
    // Obtiene fecha actual (UTC-3)
    const hoy = new Date(Date.now() - 3*3600000).toISOString().split("T")[0]
    
    // GET resultado real
    const r2 = await fetch(
      `/api/resultado?date=${hoy}&turno=${encodeURIComponent(so)}`
    )
    const drawData = await r2.json()
    
    if (!drawData?.found || !drawData?.numbers?.length) {
      setResultadoControl({
        error: "Todavia no hay resultado para este sorteo. " +
               "Los crons cargan los datos 30 minutos despues de cada sorteo."
      })
      return
    }
    
    // Convierte números reales a 2 cifras
    const reales = drawData.numbers.map(
      (n) => String(Number(n) % 100).padStart(2, "0")
    )
    
    // Obtiene números predichos (10 o 5 según dígitos)
    const predichos = cur.slice(0, dg === 2 ? 10 : 5)
                         .map((p) => p.numero)
    
    // Calcula aciertos
    const aciertos = predichos
      .filter((n) => reales.includes(n))
      .map((n) => ({
        numero: n,
        puesto: reales.indexOf(n) + 1
      }))
    
    setResultadoControl({
      aciertos,
      predichos,
      reales,
      fecha: hoy,
      turno: so
    })
  } catch (e) {
    setResultadoControl({ error: "Error: " + e.message })
  }
  
  setControlando(false)
}
```

**Ubicación en código**: Aproximadamente línea 330-360

**Función**: 
- Compara predicciones generadas vs resultados reales del sorteo
- Variables clave:
  - `predichos`: Números predichos por el motor
  - `reales`: Números oficiales del sorteo
  - `aciertos`: Números que coinciden

**Resultado mostrado**:
```
🎉 Acertaste 3 número(s)!
- 45 (Puesto 1)
- 78 (Puesto 3)
- 92 (Puesto 5)
```

**Mensajes especiales**:
- ❌ Sin aciertos esta vez
- ⏳ Verificando...
- ⚠️ "Aún no hay resultado para este sorteo. Los crons cargan los datos 30 minutos después de cada sorteo."

---

#### 💰 "💰 Sugerencias de apuesta" - Calculadora
```typescript
// Estado de la calculadora
const [apCalc, setApCalc] = useState(250)      // Apuesta por cifra ($)
const [rdblCalc, setRdblCalc] = useState(1000) // Apuesta redoblona ($)
```

**Función**: Calcula premios estimados según apuesta

**Rango de apuestas**:
- Por cifra: $100 - $2,000
- Redoblona: $200 - $5,000

**Cálculos**:
```
2 Cifras:  apCalc × 70 + apCalc × 7 = Mayor premio
3 Cifras:  (apCalc × 600 + apCalc × 60) × 0.721 = Con descuento AFIP
4 Cifras:  (apCalc × 3500 + apCalc × 350) × 0.721 = Con descuento AFIP
Redoblona: rdblCalc × 70 × 7 = Cifra exacta
```

**Nota**: Premios estimados, sujetos a prorrateo y descuentos AFIP ~27.9%

---

#### 📊 Pestañas de visualización
```typescript
const [tab, setTab] = useState("pred")  // "pred" | "rdbl" | "freq" | "mis"
```

| Tab | Color | Contenido |
|-----|-------|-----------|
| **Predicciones** | 🔴 Rojo | Top 10 números predichos (2 cifras) |
| **Redoblona** | 🔵 Cyan | Par más probable + Top 5 alternativas |
| **Frecuencia** | 🟣 Púrpura | Heatmap de números (0-99) |
| **Mis Predicciones** | 🟢 Verde | Historial de predicciones guardadas |

---

#### 🔔 Otros botones:
- **Copiar**: Copia predicción al clipboard
- **Compartir**: WhatsApp, Facebook, Twitter, Telegram
- **Guardar predicción**: Almacena en BD para historial
- **🔔 Notificaciones**: Activa push notifications
- **⚙️ Admin**: Acceso a panel admin (si es premium)
- **Salir**: Logout

---

#### 📈 Estadísticas mostradas:
```typescript
// Datos obtenidos de GET /api/estadisticas
const stats = {
  pct: 68,           // % Aciertos últimos 30 sorteos
  racha: 5,          // Racha actual
  totalSorteos: 342, // Total sortos analizados
  mensaje: "Motor: 342 sorteos analizados. Precisión: 68% (ultimos 30)."
}
```

---

### 4. **`/admin` → `app/admin/page.tsx`** ⚙️ PANEL ADMIN
```typescript
// Solo accessible si: role === "admin"
```

**Secciones:**

#### 👥 Gestión de usuarios
```typescript
// Formulario: crear usuario nuevo
async function create() {
  const r = await fetch("/api/admin", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: JSON.stringify({
      action: "create",
      email: ne,
      password: np,
      role: nr,    // "free" | "premium" | "admin"
      days: days   // Duración premium
    })
  })
}
```

**Tabla de usuarios**:
- Email
- Rol actual (ADMIN / PREMIUM / FREE)
- Fecha vencimiento premium
- Botones:
  - `+X días Premium` - Extiende X días
  - `Hacer Admin` - Promueve a admin
  - `Quitar acceso` - Revierte a free

#### 🤖 Scraper manual
```typescript
async function runScraper(turno: string) {
  const r = await fetch(
    `/api/cron?secret=quiniela2024cron&turno=${turno}&days=1`
  )
}
```

**Botones**:
- Previa, Primera, Matutina, Vespertina, Nocturna
- "Cargar todos (hoy)" - Carga los 5 turnos

**Función**: Ejecuta scraper manual de quinielanacional1.com.ar

#### 📊 Estadísticas
- Total usuarios
- Premium activos
- Admins
- Plan free

---

### 5. **`/eliminar-cuenta` → `app/eliminar-cuenta/page.tsx`**
- Función: Eliminación de cuenta de usuario
- Datos no especificados (implementación simple)

### 6. **`/privacidad` → `app/privacidad/page.tsx`**
- Función: Política de privacidad
- Datos no especificados (página informativa)

---

## 🔗 RUTAS API

### **POST `/api/login`** - 🔐 AUTENTICACIÓN
```typescript
POST /api/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "contraseña123",
  "action": "signup" // o "signin"
}

// Response (200 OK):
{
  "access_token": "eyJhbGc...",
  "refresh_token": "...",
  "expires_in": 3600,
  "user": {
    "id": "12345",
    "email": "user@example.com"
  },
  "needsConfirmation": false  // true si email sin confirmar
}

// Response (400/500):
{
  "error": "Email ya registrado. Inicia sesion." // o similar
}
```

**Pasos**:
1. **Signup**: Crea usuario en Supabase Auth + email confirmation
2. **Signin**: Valida credenciales contra Supabase Auth
3. **Almacenamiento**: Token guardado en `localStorage` con clave:
   ```javascript
   `sb-${projectId}-auth-token`
   // Ej: sb-wazkylxgqckjfkcmfotl-auth-token
   ```

**Errores comunes**:
- "Email o contraseña incorrectos"
- "Confirma tu email primero"
- "Email ya registrado. Inicia sesion"
- "Supabase no responde" (timeout)

---

### **GET `/api/predictions`** - 🧠 MOTOR ESTADÍSTICO

```typescript
GET /api/predictions?sorteo=Nocturna
Authorization: Bearer eyJhbGc...

// Response (200 OK):
{
  "numeros": [
    {
      "numero": "45",
      "significado": "Vino",
      "score": 0.92,
      "frecuencia": 127,
      "posiciones": [1, 2, 5, ...]
    },
    // ... más números
  ],
  "redoblona": "45-78",           // Par más probable
  "rdblTop5": ["45-78", "34-92", ...],
  "pred3d": ["456", "345", "678", "123", "789"],
  "pred4d": ["4567", "3456", "6789", ...],
  "heatmap": [
    { "numero": 0, "f": 45 },
    { "numero": 1, "f": 52 },
    // ... frecuencias por número
  ],
  "aiInsight": "Este sorteo tiene patrones de ciclo alto..."
}
```

**Motor analiza 6 factores**:
1. ✅ Frecuencia histórica (qué números salen más)
2. ✅ Análisis de ciclos (patrones temporales)
3. ✅ Coocurrencia (qué números salen juntos)
4. ✅ Sesgos configurables (números especiales por sorteo)
5. ✅ Patrones temporales (día de la semana, momento del día)
6. ✅ Análisis de tendencias (números en alza/baja)

**Algoritmo Monte Carlo**:
- Simula 20,000 muestras
- Pondera frecuencias
- Calcula distribución de probabilidad

---

### **GET `/api/resultado`** - 📊 RESULTADOS REALES

```typescript
GET /api/resultado?date=2024-12-15&turno=Nocturna
Authorization: Bearer eyJhbGc...

// Response (200 OK):
{
  "found": true,
  "numbers": [9999, 4567, 3456, 2345, 0123, ...],
  "date": "2024-12-15",
  "turno": "Nocturna",
  "total": 20
}

// Response (200 - No disponible):
{
  "found": false,
  "message": "Aún no hay resultado para Nocturna del 2024-12-15",
  "fecha": "2024-12-15",
  "turno": "Nocturna"
}

// Response (400):
{
  "found": false,
  "error": "Parámetros requeridos: date (YYYY-MM-DD) y turno"
}
```

**Validaciones**:
- Formato fecha: `YYYY-MM-DD`
- Turno: "Previa", "Primera", "Matutina", "Vespertina", "Nocturna"
- Timeout: 8 segundos

**Mensaje especial**:
> "Aún no hay resultado para este sorteo. Los crons cargan los datos 30 minutos después de cada sorteo."

---

### **GET `/api/estadisticas`** - 📈 ESTADÍSTICAS DEL MOTOR

```typescript
GET /api/estadisticas

// Response:
{
  "totalSorteos": 342,
  "desde": "2024-01-15",
  "hasta": "2024-12-20",
  "porTurno": {
    "Previa": 68,
    "Primera": 69,
    "Matutina": 68,
    "Vespertina": 69,
    "Nocturna": 68
  },
  "pct": 68,
  "racha": 5,
  "mensaje": "Motor: 342 sorteos analizados. Precisión: 68% (ultimos 30)."
}
```

**Cálculos**:
- Últimos 30 sorteos para porcentaje
- Contador de rachas (aciertos consecutivos)
- Distribución por turno

---

### **GET `/api/cron`** - 🤖 WEB SCRAPER

```typescript
GET /api/cron?secret=quiniela2024cron&turno=Nocturna&days=1
Authorization: Bearer eyJhbGc... (optional)

// O con header:
X-Cron-Secret: quiniela2024cron

// Response:
{
  "ok": true,
  "fechaStr": "2024-12-20",
  "turno": "Nocturna",
  "total": 20,
  "nums": [9999, 4567, 3456, 2345, 0123]  // Primeros 5
}

// Response (turno="todos"):
{
  "ok": true,
  "fechaStr": "2024-12-20",
  "results": [
    { "turno": "Previa", "ok": true, "total": 20 },
    { "turno": "Primera", "ok": true, "total": 20 },
    // ...
  ]
}

// Response (error):
{
  "ok": false,
  "fechaStr": "2024-12-20",
  "turno": "Nocturna",
  "msg": "Sin datos",
  "total": 0
}
```

**Seguridad**:
- Requiere `secret` query parameter O `Authorization` header O `x-cron-secret` header
- Value debe coincidir con `CRON_SECRET` env var
- Retorna 401 Unauthorized si no valida

**Proceso**:
1. Valida `secret` parameter
2. Determina turno automático por hora (si no especificado)
3. Scrape de `https://quinielanacional1.com.ar/DD-MM-YY/Turno`
4. Extrae HTML con regex: `class="numero">(\d{4})</div>`
5. Valida mínimo 5 números
6. INSERT en tabla `draws` (elimina previos del mismo día/turno)
7. Retorna cantidad de números encontrados

**Horarios automáticos**:
```
10:15-12:00 → Previa
12:00-15:00 → Primera
15:00-18:00 → Matutina
18:00-21:00 → Vespertina
21:00+ → Nocturna
```

---

### **GET/POST `/api/mis-predicciones`** - 📝 HISTORIAL DE USUARIO

#### GET - Obtener predicciones guardadas
```typescript
GET /api/mis-predicciones
Authorization: Bearer eyJhbGc...

// Response:
{
  "predictions": [
    {
      "id": "uuid-1",
      "date": "2024-12-20",
      "turno": "Nocturna",
      "numeros": ["45", "78", "23", "56", "89"],
      "resultado": ["45", "23", "89", "67", "12", ...],  // Resultado real
      "aciertos": [
        { "numero": "45", "puesto": 1 },
        { "numero": "23", "puesto": 3 },
        { "numero": "89", "puesto": 5 }
      ],
      "acerto": true,
      "created_at": "2024-12-20T15:30:00Z"
    },
    // ... más predicciones
  ]
}
```

**Lógica de aciertos**:
- Convierte números reales a módulo 100 (últimas 2 cifras)
- Busca match en predicciones
- Registra puesto en lista real

#### POST - Guardar predicción nueva
```typescript
POST /api/mis-predicciones
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "date": "2024-12-20",
  "turno": "Nocturna",
  "numeros": ["45", "78", "23", "56", "89"]
}

// Response:
{
  "ok": true
}
```

---

### **GET `/api/auth/me`** - 🔑 VERIFICAR TOKEN

```typescript
GET /api/auth/me
Authorization: Bearer eyJhbGc...

// Response (válido):
{
  "isPremium": true,
  "role": "premium",  // o "admin", "free"
  "email": "user@example.com"
}

// Response (sin token):
{
  "isPremium": false,
  "role": "free"
}

// Response (token expirado):
{
  "isPremium": false,
  "role": "free"
}
```

**Validations**:
- Verifica JWT en Supabase
- Lee tabla `user_profiles`
- Calcula si premium aún válido:
  - `role === "admin"` → Premium permanente
  - `role === "premium" && premium_until > now()` → Premium válido
  - Otros → Free

---

### **GET/POST `/api/admin`** - ⚙️ ADMINISTRACIÓN

#### GET - Listar usuarios
```typescript
GET /api/admin
Authorization: Bearer eyJhbGc... (debe ser admin)

// Response:
{
  "users": [
    {
      "id": "uuid-1",
      "email": "user@example.com",
      "role": "premium",
      "premium_until": "2025-01-20T00:00:00Z",
      "created_at": "2024-11-15T10:30:00Z"
    },
    // ... más usuarios
  ]
}

// Response (sin permisos):
{
  "error": "No tenes permisos de admin"
}
```

#### POST - Crear usuario
```typescript
POST /api/admin
Authorization: Bearer eyJhbGc... (debe ser admin)
Content-Type: application/json

{
  "action": "create",
  "email": "newuser@example.com",
  "password": "contraseña123",
  "role": "premium",  // o "admin", "free"
  "days": 30          // Duración premium (si role=premium)
}

// Response:
{
  "ok": true
}
```

#### POST - Actualizar permisos
```typescript
POST /api/admin
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "action": "premium",  // o "admin", "free"
  "userId": "uuid-1",
  "days": 30            // Solo para action="premium"
}

// Response:
{
  "ok": true
}
```

**Acciones**:
- `action="premium"`: Activa X días de premium
  - `premium_until` = now + (days * 24h)
  - `role` = "premium"
- `action="admin"`: Promueve a admin permanente
  - `premium_until` = "2099-12-31"
  - `role` = "admin"
- `action="free"`: Revierte a free
  - `premium_until` = null
  - `role` = "free"

**Permisos**: Solo admin auth con `role === "admin"`

---

## 🗄️ BASE DE DATOS (Supabase PostgreSQL)

### Tabla: **`auth.users`** (Supabase Auth)
```sql
id             UUID PRIMARY KEY
email          VARCHAR UNIQUE
password_hash  VARCHAR
email_confirmed_at TIMESTAMP
created_at     TIMESTAMP
updated_at     TIMESTAMP
```
- Gestionada por Supabase Auth
- Tokens JWT basados en `id`

### Tabla: **`user_profiles`**
```sql
id            UUID PRIMARY KEY (= auth.users.id)
email         VARCHAR
role          VARCHAR ('free', 'premium', 'admin')
premium_until TIMESTAMP NULL  -- Vencimiento premium
created_at    TIMESTAMP
updated_at    TIMESTAMP
```
- Relacionada 1:1 con `auth.users`
- `premium_until` = NULL si no es premium

### Tabla: **`draws`**
```sql
id        UUID PRIMARY KEY
date      DATE  -- YYYY-MM-DD
turno     VARCHAR ('Previa', 'Primera', 'Matutina', 'Vespertina', 'Nocturna')
numbers   INTEGER[] -- Array de números [9999, 4567, ...]
created_at TIMESTAMP
updated_at TIMESTAMP

-- Índices
UNIQUE (date, turno)
INDEX (date)
INDEX (turno)
```
- Almacena resultados reales
- Uno por día/turno
- `numbers` es array de 20-25 números

### Tabla: **`user_predictions`**
```sql
id        UUID PRIMARY KEY
user_id   UUID FOREIGN KEY (user_profiles.id)
date      DATE  -- YYYY-MM-DD
turno     VARCHAR
numeros   VARCHAR[]  -- Array de números predichos ["45", "78", ...]
created_at TIMESTAMP
updated_at TIMESTAMP

-- Índices
INDEX (user_id, date)
INDEX (date)
```
- Historial de predicciones del usuario
- Referencias a `draws` por (date, turno)

### Tabla: **`config`** (probable)
```sql
id    INT PRIMARY KEY
key   VARCHAR UNIQUE ('sesgos', ...)
value JSONB

-- Ejemplo:
{
  "key": "sesgos",
  "value": {
    "Previa": [95, 45, 15, 99],
    "Primera": [38, 73, 97, ...],
    ...
  }
}
```
- Configuración del motor
- Se actualiza automáticamente cada mes

---

## 🔄 FLUJOS DE DATOS

### FLUJO 1: Usuario Nuevo → Predicción
```
1. Usuario en /login
   ↓
2. Click "Crear cuenta" → POST /api/login?action=signup
   ↓
3. Supabase crea usuario + envía email confirmación
   ↓
4. Usuario confirma email
   ↓
5. Usuario en /login → Click "Ya tengo cuenta"
   ↓
6. POST /api/login?action=signin
   ↓
7. Supabase devuelve JWT token
   ↓
8. localStorage: sb-[project]-auth-token = {access_token, ...}
   ↓
9. window.location.href = "/predictions"
   ↓
10. /predictions carga:
    - GET /api/estadisticas
    - GET /api/auth/me (valida premium)
    - GET /api/mis-predicciones (historial)
```

### FLUJO 2: Generar Predicción
```
1. Usuario selecciona sorteo: "Nocturna"
   ↓
2. Click "⚡ Generar Predicción Ahora"
   ↓
3. function gen() ejecuta:
   GET /api/predictions?sorteo=Nocturna
   {headers: {Authorization: "Bearer " + token}}
   ↓
4. API analiza 6 factores:
   - Lee tabla `draws` (historial)
   - Lee tabla `config` (sesgos)
   - Calcula Monte Carlo
   - Llama Groq API (insights IA)
   ↓
5. Response: {numeros, redoblona, pred3d, pred4d, heatmap, aiInsight}
   ↓
6. Renderiza:
   - Top 10 números (2 cifras)
   - Tabs de visualización
   - Botón "🎯 Controla Jugada" ahora activo
   - Botón "💰 Sugerencias de apuesta"
```

### FLUJO 3: Controlar Jugada (CRÍTICO)
```
1. Usuario generó predicción ✓
   ↓
2. Esperó 30+ minutos después del sorteo
   ↓
3. Click "🎯 Controla Jugada"
   ↓
4. controlarJugada() obtiene fecha: new Date(Date.now() - 3*3600000)
   (UTC-3, Argentina)
   ↓
5. GET /api/resultado?date=2024-12-20&turno=Nocturna
   ↓
6. API busca en tabla `draws`:
   SELECT numbers FROM draws 
   WHERE date = '2024-12-20' AND turno = 'Nocturna'
   ↓
7. Si encontrado:
   - Convierte números a módulo 100: n % 100 → "45"
   - Obtiene predichos: cur.slice(0, [10 o 5]).map(x => x.numero)
   - Calcula aciertos: predichos.filter(n => reales.includes(n))
   - Calcula puesto: reales.indexOf(n) + 1
   ↓
8. Renderiza resultado:
   ✓ Acertaste X número(s)!
   - Número | Puesto
   - 45     | 1
   - 78     | 3
   
8b. Si NO encontrado:
   ⚠️ Aún no hay resultado para este sorteo.
      Los crons cargan los datos 30 minutos después de cada sorteo.
   ↓
9. Resultado guardado en estado: setResultadoControl(result)
```

### FLUJO 4: Guardar Predicción
```
1. Usuario generó predicción ✓
   ↓
2. Click botón "Guardar predicción"
   ↓
3. guardarPrediccion() ejecuta:
   POST /api/mis-predicciones
   {
     date: "2024-12-20",
     turno: "Nocturna",
     numeros: ["45", "78", "23", ...]  // Top 10 o 5
   }
   ↓
4. API INSERT en tabla `user_predictions`
   ↓
5. Mensaje: "✓ Predicción guardada"
   ↓
6. cargarMisPreds(token) recarga historial
   ↓
7. Tab "Mis predicciones" muestra historial
   (incluye aciertos si ya pasó el sorteo)
```

### FLUJO 5: Carga Automática de Sorteos (CRON)
```
HORA DEL SORTEO (oficial)
↓
+30 minutos
↓
Cron job executa:
GET /api/cron?secret=quiniela2024cron&turno=Nocturna
↓
API valida secret
↓
API scrape: https://quinielanacional1.com.ar/20-12-24/Nocturna
↓
API extrae HTML con regex:
class="numero">(\d{4})</div>
↓
Valida ≥5 números encontrados
↓
INSERT en tabla `draws`:
{
  date: "2024-12-20",
  turno: "Nocturna",
  numbers: [9999, 4567, 3456, 2345, ...]
}
↓
Responde: {ok: true, total: 20}
↓
Usuario puede "Controla Jugada" en /predictions
```

---

## 🎯 BOTÓN "CONTROLA JUGADA" - DETALLES FINALES

### Ubicación exacta
- **Archivo**: [app/predictions/page.tsx](app/predictions/page.tsx)
- **Línea**: ~330 (función `controlarJugada()`)
- **Renderizado**: ~300-320 (JSX button)

### Código JavaScript
```typescript
async function controlarJugada() {
  // Validación: necesita predicción generada
  if (!dt?.numeros?.length) {
    alert("Primero genera una prediccion")
    return
  }
  
  setControlando(true)
  setResultadoControl(null)
  
  try {
    // 1. Obtiene fecha actual (UTC-3)
    const hoy = new Date(Date.now() - 3*3600000)
      .toISOString()
      .split("T")[0]  // "2024-12-20"
    
    // 2. Busca resultado real
    const r2 = await fetch(
      `/api/resultado?date=${hoy}&turno=${encodeURIComponent(so)}`
    )
    const drawData = await r2.json()
    
    // 3. Valida que exista resultado
    if (!drawData?.found || !drawData?.numbers?.length) {
      setResultadoControl({
        error: "Todavia no hay resultado para este sorteo. " +
               "Los crons cargan los datos 30 minutos despues de cada sorteo."
      })
      return
    }
    
    // 4. Convierte números reales a 2 cifras
    const reales = drawData.numbers
      .map((n) => String(Number(n) % 100).padStart(2, "0"))
    
    // 5. Obtiene números predichos (10 o 5 según dígitos)
    const predichos = cur
      .slice(0, dg === 2 ? 10 : 5)  // Top 10 o Top 5
      .map((p) => p.numero)
    
    // 6. Calcula aciertos
    const aciertos = predichos
      .filter((n) => reales.includes(n))
      .map((n) => ({
        numero: n,
        puesto: reales.indexOf(n) + 1
      }))
    
    // 7. Guarda resultado
    setResultadoControl({
      aciertos,      // Números acertados con puesto
      predichos,     // Los X que predijo
      reales,        // Los números reales
      fecha: hoy,    // "2024-12-20"
      turno: so      // "Nocturna"
    })
    
  } catch (e) {
    setResultadoControl({
      error: "Error: " + e.message
    })
  }
  
  setControlando(false)
}
```

### Parámetros necesarios
```typescript
// En scope local de componente:
const cur = dg === 2 
  ? nums  // Top 10 números (2 cifras)
  : dg === 3
    ? p3.map(...)  // Top 5 números (3 cifras)
    : p4.map(...)  // Top 5 números (4 cifras)

const so = "Nocturna"  // Sorteo seleccionado
const dg = 2           // Dígitos seleccionados
const dt = {           // Datos predicción
  numeros: [...],
  redoblona: "...",
  ...
}
```

### Resultado visual mostrado
```html
<div style="...">
  <div style="fontSize:12px;fontWeight:800;color:#86efac">
    🎉 Acertaste 3 número(s)!
  </div>
  <div style="display:flex;flexWrap:wrap;gap:6px;justifyContent:center">
    <div style="background:rgba(34,197,94,.15);...">
      <div style="fontSize:20px;fontWeight:900;color:#86efac">45</div>
      <div style="fontSize:9px;color:#4ade80">Puesto 1</div>
    </div>
    <div>...más números...</div>
  </div>
</div>
```

---

## ⏰ HORARIOS Y CARGA AUTOMÁTICA

### Horarios Oficiales de Sorteos

| Turno | Hora | Cron Aprox. |
|-------|------|-----------|
| **Previa** | 10:15 AM | 10:45 AM |
| **Primera** | 12:00 PM | 12:30 PM |
| **Matutina** | 15:00 PM | 15:30 PM |
| **Vespertina** | 18:00 PM | 18:30 PM |
| **Nocturna** | 21:00 PM | 21:30 PM |

### Cómo se cargan automáticamente

1. **Trigger**: Cron job (Vercel Crons o similar)
   - Ejecuta: `GET /api/cron?secret=quiniela2024cron&turno=todos`
   - Periodicidad: Cada hora (después de cada sorteo)

2. **Scraping**:
   ```
   Fuente: https://quinielanacional1.com.ar/DD-MM-YY/Turno
   Método: fetch + regex
   Patrón: class="numero">(\d{4})</div>
   Validación: ≥5 números
   ```

3. **Guardado**:
   ```sql
   DELETE FROM draws WHERE date = '2024-12-20' AND turno = 'Nocturna'
   INSERT INTO draws (date, turno, numbers, created_at)
   VALUES ('2024-12-20', 'Nocturna', [9999, 4567, ...], now())
   ```

4. **Disponibilidad**:
   - Usuario puede "Controla Jugada" ~30 minutos después del sorteo
   - Primera búsqueda: "Resultado no disponible"
   - Segunda búsqueda: Muestra aciertos

### Configuración Cron (ambiente)

```bash
# .env.local
CRON_SECRET=quiniela2024cron

# Vercel cron.json (probable)
{
  "crons": [{
    "path": "/api/cron?secret=quiniela2024cron&turno=todos",
    "schedule": "30 11,13,16,19,22 * * *"  // 30 min después
  }]
}
```

---

## 📦 TECNOLOGÍAS Y STACK

### Frontend
- **Framework**: Next.js 16.2.3 (React 18.3)
- **Estilos**: CSS-in-JS (inline styles) + Tailwind (probable)
- **State**: React Hooks (useState, useRef, useEffect)
- **Fonts**: Google Fonts (Inter, Playfair, DM Sans, Barlow)

### Backend
- **Runtime**: Node.js en Vercel
- **API**: Next.js API Routes
- **Scraping**: fetch() + regex
- **AI**: Groq LLM (`@ai-sdk/groq`, `ai` package)

### Database
- **Provider**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (JWT tokens)
- **API REST**: Supabase Postgrest
- **Client**: @supabase/supabase-js, @supabase/ssr

### Deployment
- **Hosting**: Vercel (Next.js native)
- **Domain**: quiniela-ia-two.vercel.app (probable)
- **CI/CD**: Automático en push

### Dependencias clave
```json
{
  "next": "^16.2.3",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "@supabase/supabase-js": "^2.45.4",
  "@supabase/ssr": "^0.5.2",
  "ai": "^6.0.141",
  "@ai-sdk/groq": "^3.0.31"
}
```

---

## 🔐 SEGURIDAD Y AUTENTICACIÓN

### Token Management
```javascript
// Almacenamiento
const proj = SB_URL.split("//")[1]?.split(".")[0]
const key = `sb-${proj}-auth-token`
localStorage.setItem(key, JSON.stringify({
  access_token: "...",
  refresh_token: "...",
  expires_at: timestamp,
  token_type: "bearer",
  user: {...}
}))

// Validación
const raw = localStorage.getItem(key)
const s = JSON.parse(raw)
if (s.expires_at < Date.now() / 1000) {
  localStorage.removeItem(key)
  window.location.href = "/login"
}
```

### Auth Header
```javascript
headers: {
  Authorization: `Bearer ${s.access_token}`
}
```

### Roles y Permisos
- **free**: Acceso a predicciones básicas
- **premium**: Acceso a features premium (duraci definida)
- **admin**: Acceso a panel admin + predicciones premium permanentes

### Cron Security
```javascript
// 3 formas de autorizar:
function authorizeCron(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  const q = req.nextUrl.searchParams.get("secret")
  const h = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const x = req.headers.get("x-cron-secret")
  
  return q === expected || h === expected || x === expected
}
```

---

## 📝 RESUMEN EJECUTIVO

### ¿Qué es Quiniela IA?
Sistema de predicción estadística para la Quiniela Nacional de Buenos Aires que utiliza análisis histórico y machine learning para predecir números con mayor probabilidad de salir.

### Variables clave
- **5 sorteos diarios**: Previa, Primera, Matutina, Vespertina, Nocturna
- **Motor**: Analiza 6 factores estadísticos
- **Precisión**: ~68% en últimos 30 sorteos (según estadísticas)
- **Usuarios**: Free + Premium + Admin
- **Base datos**: Supabase PostgreSQL con 5 años de histórico

### Flujos principales
1. **Autenticación**: Supabase Auth con JWT tokens en localStorage
2. **Predicción**: Análisis Monte Carlo + IA (Groq)
3. **Control**: Comparación predichos vs resultados reales
4. **Guardado**: Historial de predicciones por usuario
5. **Admin**: Gestión de usuarios y carga manual de resultados

### Puntos críticos
- 🎯 **Botón "Controla Jugada"**: Valida predicciones contra quiniela oficial
- ⏰ **Carga automática**: Cron scrape ~30 minutos después de cada sorteo
- 💾 **Persistencia**: Resultados reales en tabla `draws`
- 🔐 **Seguridad**: JWT tokens con validación de expiración

