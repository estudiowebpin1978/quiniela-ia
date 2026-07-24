-- ============================================================================
-- 00-diagnostic.sql: Run this FIRST to understand your current schema
-- ============================================================================

-- List all tables and their columns
SELECT
  t.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name IN (
    'games','draws','user_profiles','user_predictions','prediction_history',
    'turn_analytics','backtest_results','ml_models','ml_dl_models','motor_performance',
    'user_stats'
  )
ORDER BY t.table_name, c.ordinal_position;

-- Check for 'date' vs 'fecha' columns
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('date', 'fecha')
  AND table_name IN ('draws','user_predictions','prediction_history','turn_analytics','backtest_results')
ORDER BY table_name;

-- Check existing constraints
SELECT conname, contype, conrelid::regclass
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid::regclass::text IN ('draws','user_predictions','prediction_history','turn_analytics','backtest_results','ml_models','motor_performance')
ORDER BY conrelid::regclass::text;

-- Check existing RPC functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_ensemble_scores','get_frequency_stats','get_absence_recency_cycles',
    'get_entropy_scores','get_survival_scores','get_markov_transitions',
    'get_cooccurrence_scores','verify_predictions','run_daily_backtest',
    'compute_inter_turno_markov','compute_shannon_entropy','compute_survival_hazard',
    'get_latest_analytics','upsert_turn_analytics','compute_all_turn_analytics',
    'update_motor_performance','get_motor_accuracy','clear_old_motor_performance',
    'clean_old_predictions','to_2digit'
  )
ORDER BY routine_name;

-- Check existing RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
