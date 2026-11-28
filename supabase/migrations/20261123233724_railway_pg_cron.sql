-- Route existing Supabase pg_cron scraping jobs to the Railway service.
-- Configure both settings on the postgres database before the next scheduled run.
CREATE OR REPLACE FUNCTION public.cron_scrape_turno(turno TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  app_url TEXT := rtrim(current_setting('app.settings.railway_app_url', true), '/');
  cron_secret TEXT := current_setting('app.settings.cron_secret', true);
  req_id BIGINT;
BEGIN
  IF app_url IS NULL OR app_url !~ '^https://[^/]+$' THEN
    RAISE EXCEPTION 'app.settings.railway_app_url must be a public HTTPS origin';
  END IF;

  IF cron_secret IS NULL OR length(cron_secret) < 10 THEN
    RAISE EXCEPTION 'app.settings.cron_secret is missing or too short';
  END IF;

  req_id := net.http_post(
    url := app_url || '/api/cron-scrape',
    params := jsonb_build_object('turno', lower(turno)),
    headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret),
    timeout_milliseconds := 60000
  );
  RAISE NOTICE 'Scrape %: request_id=%', turno, req_id;
END;
$$;
