-- SQL setup for ML models persistence in Supabase
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Table for TypeScript ML models (Markov, Random Forest, Neural Net)
CREATE TABLE IF NOT EXISTS ml_models (
  id BIGSERIAL PRIMARY KEY,
  turno TEXT NOT NULL UNIQUE,
  modelos JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for Deep Learning models (LSTM, Transformer, BNN)
CREATE TABLE IF NOT EXISTS ml_dl_models (
  id BIGSERIAL PRIMARY KEY,
  turno TEXT NOT NULL UNIQUE,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_ml_models_turno ON ml_models(turno);
CREATE INDEX IF NOT EXISTS idx_ml_dl_models_turno ON ml_dl_models(turno);

-- RLS: Only service role can access (no public reads)
ALTER TABLE ml_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_dl_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON ml_models FOR ALL USING (true);
CREATE POLICY "Service role only" ON ml_dl_models FOR ALL USING (true);
