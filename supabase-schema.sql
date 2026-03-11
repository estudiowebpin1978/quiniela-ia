-- ============================================================
-- QUINIELA IA — Schema SQL para Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. TABLA PRINCIPAL: sorteos históricos
-- ============================================================
CREATE TABLE IF NOT EXISTS draws (
  id            BIGSERIAL PRIMARY KEY,
  draw_date     DATE        NOT NULL,
  sorteo        TEXT        NOT NULL CHECK (sorteo IN ('Previa','Primera','Matutina','Vespertina','Nocturna')),
  pos_1         SMALLINT    NOT NULL CHECK (pos_1  BETWEEN 0 AND 9999),
  pos_2         SMALLINT    CHECK (pos_2  BETWEEN 0 AND 9999),
  pos_3         SMALLINT    CHECK (pos_3  BETWEEN 0 AND 9999),
  pos_4         SMALLINT    CHECK (pos_4  BETWEEN 0 AND 9999),
  pos_5         SMALLINT    CHECK (pos_5  BETWEEN 0 AND 9999),
  pos_6         SMALLINT    CHECK (pos_6  BETWEEN 0 AND 9999),
  pos_7         SMALLINT    CHECK (pos_7  BETWEEN 0 AND 9999),
  pos_8         SMALLINT    CHECK (pos_8  BETWEEN 0 AND 9999),
  pos_9         SMALLINT    CHECK (pos_9  BETWEEN 0 AND 9999),
  pos_10        SMALLINT    CHECK (pos_10 BETWEEN 0 AND 9999),
  pos_11        SMALLINT    CHECK (pos_11 BETWEEN 0 AND 9999),
  pos_12        SMALLINT    CHECK (pos_12 BETWEEN 0 AND 9999),
  pos_13        SMALLINT    CHECK (pos_13 BETWEEN 0 AND 9999),
  pos_14        SMALLINT    CHECK (pos_14 BETWEEN 0 AND 9999),
  pos_15        SMALLINT    CHECK (pos_15 BETWEEN 0 AND 9999),
  pos_16        SMALLINT    CHECK (pos_16 BETWEEN 0 AND 9999),
  pos_17        SMALLINT    CHECK (pos_17 BETWEEN 0 AND 9999),
  pos_18        SMALLINT    CHECK (pos_18 BETWEEN 0 AND 9999),
  pos_19        SMALLINT    CHECK (pos_19 BETWEEN 0 AND 9999),
  pos_20        SMALLINT    CHECK (pos_20 BETWEEN 0 AND 9999),
  source        TEXT        DEFAULT 'ruta1000',   -- origen del dato
  raw_html      TEXT,                              -- HTML crudo (debug)
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (draw_date, sorteo)                       -- evitar duplicados
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_draws_date    ON draws (draw_date DESC);
CREATE INDEX IF NOT EXISTS idx_draws_sorteo  ON draws (sorteo);
CREATE INDEX IF NOT EXISTS idx_draws_date_sorteo ON draws (draw_date DESC, sorteo);

-- ============================================================
-- 2. TABLA: sorteos pendientes (scraping queue)
-- ============================================================
CREATE TABLE IF NOT EXISTS pending_draws (
  id            BIGSERIAL PRIMARY KEY,
  draw_date     DATE        NOT NULL,
  sorteo        TEXT        NOT NULL,
  raw_data      JSONB,                   -- datos crudos del scraper
  status        TEXT        DEFAULT 'pending' CHECK (status IN ('pending','processing','done','error')),
  retries       SMALLINT    DEFAULT 0,
  error_msg     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_draws (status);
CREATE INDEX IF NOT EXISTS idx_pending_date   ON pending_draws (draw_date DESC);

-- ============================================================
-- 3. TABLA: usuarios y roles premium
-- ============================================================
-- Supabase Auth maneja auth.users; esta tabla extiende el perfil
CREATE TABLE IF NOT EXISTS user_profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  role          TEXT        DEFAULT 'free' CHECK (role IN ('free','premium','admin')),
  premium_since TIMESTAMPTZ,
  premium_until TIMESTAMPTZ,
  uala_tx_id    TEXT,        -- ID de transacción Ualá
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON user_profiles (role);

-- ============================================================
-- 4. TABLA: log de predicciones (analytics)
-- ============================================================
CREATE TABLE IF NOT EXISTS prediction_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  digits        SMALLINT    NOT NULL CHECK (digits IN (2,3,4)),
  sorteo        TEXT        NOT NULL,
  predictions   JSONB       NOT NULL,   -- array de números predichos
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. TABLA: pagos / webhooks Ualá
-- ============================================================
CREATE TABLE IF NOT EXISTS uala_payments (
  id            BIGSERIAL PRIMARY KEY,
  uala_tx_id    TEXT        UNIQUE NOT NULL,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  email         TEXT,
  amount_cents  INTEGER,
  currency      TEXT        DEFAULT 'ARS',
  status        TEXT        DEFAULT 'received' CHECK (status IN ('received','applied','failed')),
  raw_payload   JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- draws: lectura pública, escritura solo service_role
ALTER TABLE draws ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "draws_select_public"  ON draws;
DROP POLICY IF EXISTS "draws_insert_service" ON draws;
DROP POLICY IF EXISTS "draws_update_service" ON draws;
CREATE POLICY "draws_select_public"
  ON draws FOR SELECT USING (true);
CREATE POLICY "draws_insert_service"
  ON draws FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "draws_update_service"
  ON draws FOR UPDATE USING (auth.role() = 'service_role');

-- pending_draws: solo service_role
ALTER TABLE pending_draws ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pending_service_only" ON pending_draws;
CREATE POLICY "pending_service_only"
  ON pending_draws USING (auth.role() = 'service_role');

-- user_profiles: cada usuario ve y edita solo el suyo
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_own" ON user_profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON user_profiles;
DROP POLICY IF EXISTS "profiles_admin_all"  ON user_profiles;
CREATE POLICY "profiles_select_own"
  ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own"
  ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_admin_all"
  ON user_profiles USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- prediction_logs: cada usuario ve los suyos; service_role inserta
ALTER TABLE prediction_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pred_logs_own"            ON prediction_logs;
DROP POLICY IF EXISTS "pred_logs_insert_service" ON prediction_logs;
CREATE POLICY "pred_logs_own"
  ON prediction_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pred_logs_insert_service"
  ON prediction_logs FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- uala_payments: solo service_role y admin
ALTER TABLE uala_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "uala_service_only" ON uala_payments;
CREATE POLICY "uala_service_only"
  ON uala_payments USING (auth.role() = 'service_role');

-- ============================================================
-- 7. FUNCIÓN: activar premium automáticamente tras pago
-- ============================================================
CREATE OR REPLACE FUNCTION activate_premium(
  p_uala_tx_id  TEXT,
  p_user_id     UUID,
  p_days        INT DEFAULT 30
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Upsert perfil con rol premium
  INSERT INTO user_profiles (id, role, premium_since, premium_until, uala_tx_id)
  VALUES (
    p_user_id,
    'premium',
    NOW(),
    NOW() + (p_days || ' days')::INTERVAL,
    p_uala_tx_id
  )
  ON CONFLICT (id) DO UPDATE SET
    role          = 'premium',
    premium_since = NOW(),
    premium_until = NOW() + (p_days || ' days')::INTERVAL,
    uala_tx_id    = p_uala_tx_id,
    updated_at    = NOW();

  -- Marcar pago como aplicado
  UPDATE uala_payments
  SET status = 'applied'
  WHERE uala_tx_id = p_uala_tx_id;
END;
$$;

-- ============================================================
-- 8. VISTA: frecuencia de números (últimos 365 días)
-- ============================================================
CREATE OR REPLACE VIEW v_frequency_2d AS
WITH all_numbers AS (
  SELECT draw_date, sorteo, unnest(ARRAY[
    pos_1 % 100, pos_2 % 100, pos_3 % 100, pos_4 % 100, pos_5 % 100,
    pos_6 % 100, pos_7 % 100, pos_8 % 100, pos_9 % 100, pos_10 % 100,
    pos_11 % 100, pos_12 % 100, pos_13 % 100, pos_14 % 100, pos_15 % 100,
    pos_16 % 100, pos_17 % 100, pos_18 % 100, pos_19 % 100, pos_20 % 100
  ]) AS num
  FROM draws
  WHERE draw_date >= CURRENT_DATE - INTERVAL '365 days'
    AND pos_1 IS NOT NULL
),
first_place AS (
  SELECT draw_date, sorteo, pos_1 % 100 AS num, 1 AS is_first
  FROM draws
  WHERE draw_date >= CURRENT_DATE - INTERVAL '365 days'
)
SELECT
  a.num,
  COUNT(*)                        AS total_appearances,
  COALESCE(SUM(f.is_first), 0)   AS first_place_count,
  COUNT(*) * 1.0 / SUM(COUNT(*)) OVER () AS frequency_ratio
FROM all_numbers a
LEFT JOIN first_place f ON a.num = f.num
GROUP BY a.num
ORDER BY total_appearances DESC;

-- ============================================================
-- 9. TRIGGER: auto-crear perfil al registrarse
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'free')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- FIN DEL SCHEMA
-- Verificar tablas creadas:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- ============================================================
