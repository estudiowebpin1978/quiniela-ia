CREATE OR REPLACE VIEW api.user_profiles AS SELECT * FROM public.user_profiles;
GRANT SELECT ON api.user_profiles TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW api.webhook_logs AS SELECT * FROM public.webhook_logs;
GRANT SELECT ON api.webhook_logs TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW api.user_predictions AS SELECT * FROM public.user_predictions;
GRANT SELECT ON api.user_predictions TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW api.prediction_history AS SELECT * FROM public.prediction_history;
GRANT SELECT ON api.prediction_history TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW api.user_stats AS SELECT * FROM public.user_stats;
GRANT SELECT ON api.user_stats TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW api.draws AS SELECT * FROM public.draws;
GRANT SELECT ON api.draws TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW api.engine_predictions AS SELECT * FROM public.engine_predictions;
GRANT SELECT ON api.engine_predictions TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW api.engine_config AS SELECT * FROM public.engine_config;
GRANT SELECT ON api.engine_config TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW api.pending_transfers AS SELECT * FROM public.pending_transfers;
GRANT SELECT ON api.pending_transfers TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW api.notifications AS SELECT * FROM public.notifications;
GRANT SELECT ON api.notifications TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW api.scrape_runs AS SELECT * FROM public.scrape_runs;
GRANT SELECT ON api.scrape_runs TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW api.backtest_results AS SELECT * FROM public.backtest_results;
GRANT SELECT ON api.backtest_results TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';