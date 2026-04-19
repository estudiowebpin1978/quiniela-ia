# CONFIGURACIÓN COMPLETA QUINIELA IA

## 1. SUPABASE - Crear Tablas

Ejecutar en SQL Editor de Supabase:

```sql
-- Tabla principal de sorteos (Quiniela Provincial)
CREATE TABLE IF NOT EXISTS draws (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  turno TEXT NOT NULL,
  numbers INTEGER[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, turno)
);

-- Tabla Quiniela Nacional Buenos Aires
CREATE TABLE IF NOT EXISTS quiniela_nacional (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  turno TEXT NOT NULL,
  resultados JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fecha, turno)
);

-- Tabla de usuarios y perfiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'free' CHECK (role IN ('free', 'premium', 'admin')),
  premium_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para crear perfil automáticamente cuando se registra usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'free');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Tabla de configuración (sesgos)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS (seguridad)
ALTER TABLE draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiniela_nacional ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso
-- draws: lectura pública, escritura solo service role
CREATE POLICY "draws_read" ON draws FOR SELECT USING (true);
CREATE POLICY "quiniela_nacional_read" ON quiniela_nacional FOR SELECT USING (true);
CREATE POLICY "user_profiles_read" ON user_profiles FOR SELECT USING (true);
CREATE POLICY "config_read" ON config FOR SELECT USING (true);

-- Insertar sesgos por defecto
INSERT INTO config (key, value) VALUES 
  ('sesgos', '{"Previa":[95,45,15,99],"Primera":[38,73,97,37,50,72,19],"Matutina":[14,24,26,74,92,20],"Vespertina":[27,14,43,92,68,69],"Nocturna":[26,35,76,45,88]}')
ON CONFLICT (key) DO NOTHING;
```

## 2. GITHUB SECRETS

En tu repositorio GitHub → Settings → Secrets and variables → Actions:

### Secrets requeridos:
- **APP_URL**: `https://quiniela-ia-two.vercel.app` (tu URL de Vercel)
- **CRON_SECRET**: `quiniela_ia_cron_2024_seguro` (o el que prefieras)

### Variables (opcional):
- **NODE_VERSION**: `20`

## 3. GITHUB ACTIONS - Workflow

El archivo `.github/workflows/cron.yml` ya está configurado para:
- Ejecutar cada hora
- Scrapear sorteos automáticamente de Quiniela Nacional

## 4. VERCEL - Deploy Automático

1. Ir a https://vercel.com
2. Importar repositorio de GitHub
3. En Settings → Environment Variables agregar:
   - `NEXT_PUBLIC_SUPABASE_URL` = Tu URL de Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Tu anon key
   - `SUPABASE_URL` = Tu URL de Supabase
   - `SUPABASE_SERVICE_KEY` = Tu service role key
   - `CRON_SECRET` = Tu secret

## 5. Verificar Funcionamiento

### Probar scraping manual:
```
GET https://tu-app.vercel.app/api/cron?secret=tu_cron_secret&turno=Nocturna
```

### Probar predicciones:
```
GET https://tu-app.vercel.app/api/predictions?sorteo=Nocturna
```

### Revisar estadísticas:
```
GET https://tu-app.vercel.app/api/estadisticas
```

## 6. CRON JOB EXTERNO (Opcional)

Puedes usar https://cron-job.org para llamadas adicionales:
- URL: `https://tu-app.vercel.app/api/cron?secret=CRON_SECRET&turno=todos`
- Schedule: cada hora

---

## Estructura de la API:

| Endpoint | Función |
|----------|---------|
| `GET /api/predictions?sorteo=Nocturna` | Predicciones (requiere auth) |
| `GET /api/cron?secret=XXX&turno=Nocturna` | Scraping Quiniela Provincial |
| `GET /api/cron-nacional?secret=XXX` | Scraping Quiniela Nacional |
| `GET /api/resultado?date=YYYY-MM-DD&turno=Nocturna` | Obtener resultado |
| `GET /api/estadisticas` | Estadísticas globales |
| `GET /api/backtest?days=30` | Análisis histórico |
| `GET /api/admin` | Listar usuarios (admin) |
| `POST /api/admin` | Gestionar usuario (admin) |
| `POST /api/login` | Iniciar sesión |
| `POST /api/actualizar-sesgos` | Actualizar sesgos (admin) |