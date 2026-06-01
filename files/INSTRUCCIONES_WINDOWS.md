# INSTRUCCIONES - QUINIELA IA
## Windows (C:\Users\usuario\quiniela-ia)

---

## PASO 1 - Crear carpeta del proyecto

```cmd
mkdir C:\Users\usuario\quiniela-ia
cd C:\Users\usuario\quiniela-ia
```

---

## PASO 2 - Copiar archivos del proyecto

Descargar ZIP del proyecto y extraer todos los archivos en:
```
C:\Users\usuario\quiniela-ia\
```

Estructura esperada:
```
C:\Users\usuario\quiniela-ia\
├── scraper_y_upload_supabase.py
├── predictor.py
├── api.py
├── analisis_estadistico.py
├── actualizar_predicciones.py
├── cron_diario.py
├── frontend/
│   └── index.html
├── api/
│   └── predictions.ts
├── requirements.txt
├── package.json
├── vercel.json
├── tsconfig.json
├── schema.sql
├── .env.example
└── .gitignore
```

---

## PASO 3 - Crear archivo .env

Renombrar `.env.example` a `.env`:

```
C:\Users\usuario\quiniela-ia\.env
```

Editar con Notepad y pegar:

```
SUPABASE_URL=https://wazkylxgqckjfkcmfotl.supabase.co
SUPABASE_KEY=PEGAR_AQUI_SERVICE_ROLE_KEY
```

**Obtener SUPABASE_KEY:**
1. Ir a https://supabase.com/dashboard
2. Proyecto: quiniela ia
3. Settings → API
4. Copiar `service_role` (NO anon)
5. Pegar en SUPABASE_KEY

---

## PASO 4 - Instalar dependencias

```cmd
cd C:\Users\usuario\quiniela-ia

C:\Python314\python.exe -m pip install -r requirements.txt
```

Debe instalar:
- requests
- beautifulsoup4
- python-dotenv
- flask
- flask-cors

---

## PASO 5 - Ejecutar scraper (primera vez)

```cmd
C:\Python314\python.exe scraper_y_upload_supabase.py
```

**Tiempo estimado:** 3-5 horas (raspa 182 fechas faltantes con delay de 1.2s)

Verás output como:
```
============================================================
  QUINIELA NACIONAL -> SUPABASE
  2026-06-01 10:30:45
============================================================

[1/4] Consultando Supabase...
      662 fechas ya en la base de datos

[2/4] Calculando fechas faltantes...
      182 fechas a procesar

[3/4] Scrapeando...
  [  1/182] 2025-06-20 (Vie)  ->  4 turnos: previa, primera, matutina, vespertina
  [  2/182] 2025-06-23 (Lun)  ->  5 turnos: previa, primera, matutina, vespertina, nocturna
  ...

[4/4] Subiendo 728 registros a Supabase...
    Batch 1: 30 registros OK
    Batch 2: 30 registros OK
    ...

============================================================
  Registros subidos  : 728
  Fechas procesadas  : 182
  Tiempo             : 185.3s
============================================================
```

---

## PASO 6 - Ver estadísticas

```cmd
C:\Python314\python.exe analisis_estadistico.py
```

Output ejemplo:
```
============================================================
  ANALISIS ESTADISTICO - QUINIELA NACIONAL
  Supabase: wazkylxgqckjfkcmfotl
============================================================

────────────────────────────────────────────────────────
  COBERTURA DE DATOS POR TURNO
────────────────────────────────────────────────────────
  TURNO          SORTEOS    DIAS  DESDE         HASTA
  ────────────────────────────────────────────────────
  MATUTINA          140     140   2025-05-05    2026-05-05
  NOCTURNA          138     138   2025-05-07    2026-05-05
  PREVIA            139     139   2025-05-05    2026-05-05
  PRIMERA           139     139   2025-05-05    2026-05-05
  VESPERTINA        139     139   2025-05-05    2026-05-05

────────────────────────────────────────────────────────
  TOP 10 TERMINACIONES EN CABEZA (posicion 1)
────────────────────────────────────────────────────────

  [NOCTURNA]
  TERM.    VECES  %
  ──────────────────
  53         13   9.85%
  63         11   8.33%
  80          4   3.03%
  ...
```

---

## PASO 7 - Ejecutar predicciones IA

```cmd
C:\Python314\python.exe predictor.py
```

Output:
```
Predicciones para NOCTURNA (2026-06-01):

#1  53  Score: 82.45%  [Freq: 95%, Trend: 78%, MC: 89%, ...]
#2  63  Score: 76.32%  [Freq: 82%, Trend: 65%, MC: 81%, ...]
#3  45  Score: 71.88%  [Freq: 71%, Trend: 72%, MC: 75%, ...]
...
```

---

## PASO 8 - Iniciar API local

```cmd
C:\Python314\python.exe api.py
```

La API estará en:
```
http://localhost:5000
```

Endpoint:
```
GET http://localhost:5000/api/predictions?turno=nocturna&fecha=2026-06-01&top=10
```

---

## PASO 9 - Automatizar con Task Scheduler (Windows)

1. Presionar `Win + R`
2. Escribir: `taskschd.msc`
3. Click: Crear tarea básica
4. **General:**
   - Nombre: Quiniela Cron Diario
   - Descripción: Ejecuta scraper + análisis diariamente

5. **Desencadenador:**
   - Nuevo → Diariamente
   - Hora: 23:30
   - Cada: 1 día

6. **Acción:**
   - Nuevo → Iniciar un programa
   - Programa: `C:\Python314\python.exe`
   - Argumentos: `C:\Users\usuario\quiniela-ia\cron_diario.py`
   - Carpeta inicial: `C:\Users\usuario\quiniela-ia`

7. **Guardar**

---

## PASO 10 - Deploy en Vercel

1. Conectar repositorio GitHub a Vercel
2. En Vercel dashboard → Environment Variables:
   - `SUPABASE_URL` = `https://wazkylxgqckjfkcmfotl.supabase.co`
   - `SUPABASE_KEY` = SERVICE_ROLE_KEY

3. Deploy automático en cada push a main

---

## COMANDOS RÁPIDOS

```cmd
# Raspar datos faltantes
C:\Python314\python.exe scraper_y_upload_supabase.py

# Ver estadísticas
C:\Python314\python.exe analisis_estadistico.py

# Generar predicciones IA
C:\Python314\python.exe predictor.py

# Iniciar API local (port 5000)
C:\Python314\python.exe api.py

# Ejecutar cron manualmente
C:\Python314\python.exe cron_diario.py

# Instalar dependencias
C:\Python314\python.exe -m pip install -r requirements.txt
```

---

## ERRORES COMUNES

| Error | Solución |
|-------|----------|
| `ModuleNotFoundError: requests` | `C:\Python314\python.exe -m pip install -r requirements.txt` |
| `401 Unauthorized` | Verificar SUPABASE_KEY en .env (usar service_role, no anon) |
| `Connection timeout` | Verificar SUPABASE_URL (sin barra al final) |
| `No such file or directory` | Asegurar que estás en `C:\Users\usuario\quiniela-ia` |
| `KeyError: SUPABASE_URL` | El archivo `.env` no está en la carpeta del script |
| `Port 5000 already in use` | Cambiar puerto en api.py línea 300 o cerrar proceso |

---

## MONITOREO

Logs están en:
```
C:\Users\usuario\quiniela-ia\cron.log
```

Ver últimas líneas:
```cmd
type C:\Users\usuario\quiniela-ia\cron.log
```

---

## RESET COMPLETO (si algo sale mal)

```cmd
# Eliminar caché Python
rmdir /s /q C:\Users\usuario\quiniela-ia\__pycache__
del /q C:\Users\usuario\quiniela-ia\*.pyc

# Reinstalar dependencias
C:\Python314\python.exe -m pip install --upgrade -r requirements.txt

# Limpiar logs
del C:\Users\usuario\quiniela-ia\cron.log
```

---

## CONTACTO / SOPORTE

- **BD:** Supabase → wazkylxgqckjfkcmfotl
- **Frontend:** http://localhost:3000 (desarrollo local)
- **API:** http://localhost:5000/api/predictions
- **Docs:** https://supabase.com/docs
