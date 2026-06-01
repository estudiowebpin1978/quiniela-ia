# Quiniela IA - Sistema de Predicciones Avanzado

**App web de predicciones para la Quiniela Nacional (Buenos Aires)** basada en algoritmo multi-factor con 11 componentes ponderados.

---

## 🎯 Características

✅ **Backend Robusto**
- Scraper automático de quinieleando.com.ar (365 días de histórico)
- 662+ sorteos registrados en Supabase
- Logs de sincronización en tiempo real
- Manejo inteligente de duplicados (índice unique)

✅ **IA Predictiva (11 Factores)**
1. Frecuencia histórica (15%)
2. Retraso medio (10%)
3. Tendencia reciente (12%)
4. Monte Carlo (8%)
5. Primera posición (5%)
6. Día de semana (7%)
7. Patrón (6%)
8. Mes (8%)
9. Overdue (10%)
10. Posicional (8%)
11. Rachas (6%)

✅ **Frontend Moderno**
- Dashboard dark mode cyberpunk
- Integración Supabase real-time
- Diseño responsive
- Visualización de factores y puntajes

✅ **Automatización**
- Cron diario (Windows Task Scheduler / cron-job.org)
- Scraping automático de nuevos sorteos
- Análisis estadístico automático
- Logs centralizados

---

## 📦 Estructura

```
quiniela-ia/
├── Backend
│   ├── scraper_y_upload_supabase.py    # Raspa + sube a Supabase
│   ├── predictor.py                    # Motor IA con 11 factores
│   ├── api.py                          # API Flask local
│   ├── analisis_estadistico.py         # Reportes estadísticos
│   ├── actualizar_predicciones.py      # Script de actualización
│   └── cron_diario.py                  # Automatización diaria
│
├── Frontend
│   └── frontend/index.html             # Dashboard completo
│
├── API Serverless
│   └── api/predictions.ts              # Handler Vercel
│
├── Configuración
│   ├── requirements.txt                # Dependencias Python
│   ├── package.json                    # Dependencias Node/TypeScript
│   ├── vercel.json                     # Config Vercel
│   ├── tsconfig.json                   # Config TypeScript
│   ├── schema.sql                      # Estructura BD Supabase
│   ├── .env.example                    # Variables de entorno
│   └── .gitignore
│
└── Documentación
    └── INSTRUCCIONES_WINDOWS.md        # Guía paso a paso
```

---

## 🚀 Inicio Rápido

### 1. Configuración

```bash
# Clonar/descargar proyecto
cd C:\Users\usuario\quiniela-ia

# Crear .env desde .env.example
cp .env.example .env

# Editar .env con credenciales:
# SUPABASE_URL=https://wazkylxgqckjfkcmfotl.supabase.co
# SUPABASE_KEY=PEGAR_SERVICE_ROLE_KEY
```

### 2. Instalar dependencias

```bash
C:\Python314\python.exe -m pip install -r requirements.txt
```

### 3. Llenar datos históricos (primera vez)

```bash
C:\Python314\python.exe scraper_y_upload_supabase.py
```

⏱️ **Duración:** ~3-5 horas (raspa 182 fechas faltantes con delay respetuoso)

### 4. Ver estadísticas

```bash
C:\Python314\python.exe analisis_estadistico.py
```

### 5. Generar predicciones

```bash
C:\Python314\python.exe predictor.py
```

### 6. Iniciar API local (opcional)

```bash
C:\Python314\python.exe api.py
# Acceder a: http://localhost:5000/api/predictions?turno=nocturna
```

---

## 📊 Base de Datos (Supabase)

**Proyecto:** `wazkylxgqckjfkcmfotl`

**Tablas:**
- `draws`: 662 sorteos (date, turno, numbers[], source)
- `sync_logs`: logs de sincronización

**Vistas:**
- `v_frecuencia_cabeza`: top terminaciones posición 1
- `v_frecuencia_general`: frecuencia posiciones 1-20
- `v_numeros_atrasados`: números con más días sin salir
- `v_cobertura_diaria`: datos disponibles por fecha
- `v_stats_por_turno`: estadísticas resumidas por turno

---

## 🤖 Algoritmo Predictivo

### Flujo

1. **Obtener datos históricos** (últimos 1000 sorteos del turno)
2. **Calcular 11 factores** independientemente
3. **Normalizar [0,1]** cada factor
4. **Aplicar pesos** según importancia
5. **Sumar ponderado** = Score final
6. **Ordenar** por puntuación (de mayor a menor)

### Ejemplo de salida

```json
{
  "turno": "nocturna",
  "fecha": "2026-06-01",
  "predictions": [
    {
      "num": "53",
      "score": 0.8245,
      "factors": {
        "freq": 0.95,
        "delay": 0.42,
        "trend": 0.78,
        "mc": 0.89,
        "first": 0.65,
        "day": 0.71,
        "pattern": 0.58,
        "month": 0.64,
        "overdue": 0.88,
        "pos": 0.76,
        "runs": 0.54
      }
    },
    ...
  ]
}
```

---

## 🔄 Automatización

### Windows Task Scheduler

```
Tarea: Quiniela Cron Diario
Horario: Diariamente 23:30
Acción: C:\Python314\python.exe C:\Users\usuario\quiniela-ia\cron_diario.py
```

### Resultado diario

1. Raspa nuevos sorteos (si los hay)
2. Ejecuta análisis estadístico
3. Registra en `cron.log`

---

## 🌐 Deployment (Vercel)

### Requisitos

- ✅ Repositorio GitHub
- ✅ Cuenta Vercel conectada
- ✅ Environment variables configuradas

### Pasos

1. Conectar repo a Vercel
2. Agregar variables de entorno:
   - `SUPABASE_URL`
   - `SUPABASE_KEY` (service_role)
3. Deploy automático en cada push

### Acceso

```
https://quiniela-ia.vercel.app
API: https://quiniela-ia.vercel.app/api/predictions?turno=nocturna
```

---

## 📋 Estado del Proyecto

| Componente | Estado |
|-----------|--------|
| Scraper | ✅ Completo |
| BD Supabase | ✅ Configurada |
| IA (11 factores) | ✅ Implementada |
| API Flask | ✅ Funcional |
| Frontend | ✅ Responsive |
| Vercel Config | ✅ Lista |
| Automatización | ✅ Configurada |
| Documentación | ✅ Completa |

---

## 📈 Datos Actuales

- **Total sorteos:** 662
- **Días cubiertos:** 140-140 (todos los turnos)
- **Período:** 2025-05-05 a 2026-05-05
- **Fechas faltantes:** 182 (se completan automáticamente)

---

## 🛠️ Desarrollo Local

```bash
# Frontend (si usas servidor local)
cd frontend
npx http-server

# O en Python:
python -m http.server 3000

# API Flask
C:\Python314\python.exe api.py
```

Acceder a:
- Frontend: http://localhost:8000
- API: http://localhost:5000/api/predictions

---

## ⚠️ Advertencia Legal

La quiniela es un **juego de azar**. Este sistema se basa en análisis estadístico e histórico, pero **NO garantiza aciertos**. Úsalo solo para entretenimiento y juega responsablemente.

**Nunca apuestes más de lo que puedes perder.**

---

## 📝 Comandos Útiles

```bash
# Raspar datos
C:\Python314\python.exe scraper_y_upload_supabase.py

# Analizar
C:\Python314\python.exe analisis_estadistico.py

# Predecir
C:\Python314\python.exe predictor.py

# API local
C:\Python314\python.exe api.py

# Cron manual
C:\Python314\python.exe cron_diario.py

# Actualizar
C:\Python314\python.exe actualizar_predicciones.py

# Instalar deps
C:\Python314\python.exe -m pip install -r requirements.txt
```

---

## 📞 Soporte

- **DB Issues:** https://supabase.com/dashboard
- **Scraper:** Revisar cron.log
- **IA:** Validar .env y dependencias
- **Frontend:** Abrir DevTools (F12)

---

## 📄 Licencia

MIT - Uso libre con fines educativos y de entretenimiento.

---

**Versión:** 1.0.0  
**Última actualización:** 2026-06-01  
**Desarrollador:** Quiniela IA Team
