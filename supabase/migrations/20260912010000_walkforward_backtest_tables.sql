-- Estructura SQL para walk-forward backtesting real por turno y motor
CREATE TABLE IF NOT EXISTS public.walkforward_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  turno TEXT NOT NULL,
  test_date DATE NOT NULL,
  engine_name TEXT NOT NULL CHECK (engine_name IN ('V6', 'V7', 'ML', 'ENSEMBLE')),
  predicted_numbers INTEGER[] NOT NULL,
  actual_numbers INTEGER[] NOT NULL,
  is_hit BOOLEAN NOT NULL DEFAULT FALSE,
  is_near_miss BOOLEAN NOT NULL DEFAULT FALSE,
  near_miss_details JSONB DEFAULT '{}'::jsonb,
  confidence_score NUMERIC(5,4) DEFAULT NULL,
  weights_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (turno, test_date, engine_name)
);

CREATE INDEX IF NOT EXISTS idx_wf_results_turno_date ON public.walkforward_results(turno, test_date);
CREATE INDEX IF NOT EXISTS idx_wf_results_engine ON public.walkforward_results(engine_name);

CREATE TABLE IF NOT EXISTS public.walkforward_progress (
  turno TEXT PRIMARY KEY,
  last_processed_date DATE DEFAULT NULL,
  total_dates INTEGER DEFAULT 0,
  completed_dates INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  last_error TEXT DEFAULT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
