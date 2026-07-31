# DATABASE.md — Quiniela IA

## Tablas Principales

### draws
Resultados oficiales de la Quiniela Nacional.
```sql
CREATE TABLE draws (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  turno TEXT NOT NULL,
  numbers INTEGER[] NOT NULL,
  game_id UUID NOT NULL REFERENCES games(id),
  source TEXT,
  html_hash TEXT,
  confidence_score NUMERIC(3,2) DEFAULT 1.0,
  sources_evaluated TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date, turno, game_id)
);
CREATE INDEX idx_draws_date_turno ON draws (date, turno);
```

### user_profiles
Perfiles de usuario con tier y expiración.
```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  role TEXT DEFAULT 'free',
  premium_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### user_predictions
Predicciones guardadas por usuarios.
```sql
CREATE TABLE user_predictions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES user_profiles(id),
  turno TEXT NOT NULL,
  date DATE NOT NULL,
  numbers INTEGER[] NOT NULL,
  cifras INTEGER DEFAULT 2,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_user_predictions_user ON user_predictions (user_id, created_at);
```

### turn_analytics
Análisis pre-calculados por turno.
```sql
CREATE TABLE turn_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  turno TEXT NOT NULL,
  fecha DATE NOT NULL,
  entropy_scores NUMERIC[],
  survival_scores NUMERIC[],
  markov_scores NUMERIC[],
  genetic_weights JSONB,
  composite_confidence NUMERIC,
  fecha_calculo TIMESTAMPTZ DEFAULT now(),
  UNIQUE(turno, fecha)
);
```

### rate_limits
Rate limiting con Supabase.
```sql
CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  hits INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (key, window_start)
);
```

## RPCs Principales

### check_rate_limit
Rate limiting con sliding window.
```sql
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key TEXT,
  p_window_start BIGINT,
  p_now BIGINT,
  p_max INTEGER,
  p_window_sec INTEGER
) RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, reset_at BIGINT, total_hits INTEGER);
```

### verify_predictions_on_draw
Trigger automático al insertar sorteo.
```sql
CREATE OR REPLACE FUNCTION verify_predictions_on_draw()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE user_predictions SET status = CASE
    WHEN predicao && NEW.numbers THEN 'WON'
    ELSE 'LOST'
  END WHERE date = NEW.date AND turno = NEW.turno AND status = 'pending';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### check_prediction_tier
RLS para Free/Premium.
```sql
CREATE OR REPLACE FUNCTION check_prediction_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cifras > 2 AND NOT is_premium(NEW.user_id) THEN
    RAISE EXCEPTION 'Free tier only allows 2-cifras';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```
