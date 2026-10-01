CREATE TABLE IF NOT EXISTS public.omega_promotion_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  turno TEXT NOT NULL,
  old_engine_version TEXT,
  new_engine_version TEXT,
  evaluation_period_start DATE,
  evaluation_period_end DATE,
  sample_size INTEGER,
  metrics_before JSONB DEFAULT '{}'::jsonb,
  metrics_after JSONB DEFAULT '{}'::jsonb,
  weights_before JSONB DEFAULT '{}'::jsonb,
  weights_after JSONB DEFAULT '{}'::jsonb,
  calibration_before JSONB DEFAULT '{}'::jsonb,
  calibration_after JSONB DEFAULT '{}'::jsonb,
  promotion_decision TEXT CHECK (promotion_decision IN ('APPROVED', 'REJECTED', 'INSUFFICIENT_SAMPLE', 'FAILED_STABILITY', 'FAILED_CALIBRATION', 'FAILED_PERFORMANCE')),
  reason TEXT,
  promoted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_omega_audit_turno ON public.omega_promotion_audit(turno);
CREATE INDEX IF NOT EXISTS idx_omega_audit_decision ON public.omega_promotion_audit(promotion_decision);
