-- ============================================================
-- MIGRATION: Enable pg_cron + pg_net for scheduled scraping
-- Date: 2026-08-05
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function called by pg_cron to trigger scraper via HTTP
CREATE OR REPLACE FUNCTION cron_scrape_turno(turno TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  secret TEXT := 'MDM2ZDVjOGItMzk4Yi00Mjk2LTlmNmYtYjA1OTJkNWQwNGFm';
  result TEXT;
BEGIN
  SELECT content INTO result
  FROM net.http_get(
    url := 'https://quiniela-ia-two.vercel.app/api/cron-scrape?turno=' || LOWER(turno) || '&secret=' || secret,
    timeout_milliseconds := 60000
  );
  RAISE NOTICE 'Scrape % result: %', turno, result;
END;
$$;

-- Schedule scraping for each turno (times in UTC)
-- Previa:    13:15 UTC = 10:15 ART
-- Primera:   15:15 UTC = 12:15 ART
-- Matutina:  18:15 UTC = 15:15 ART
-- Vespertina:21:15 UTC = 18:15 ART
-- Nocturna:  00:15 UTC = 21:15 ART (previous day)

SELECT cron.schedule('scrape_previa',     '15 13 * * 1-6', $$ SELECT cron_scrape_turno('Previa') $$);
SELECT cron.schedule('scrape_primera',    '15 15 * * 1-6', $$ SELECT cron_scrape_turno('Primera') $$);
SELECT cron.schedule('scrape_matutina',   '15 18 * * 1-6', $$ SELECT cron_scrape_turno('Matutina') $$);
SELECT cron.schedule('scrape_vespertina', '15 21 * * 1-6', $$ SELECT cron_scrape_turno('Vespertina') $$);
SELECT cron.schedule('scrape_nocturna',   '15 0 * * 1-6',  $$ SELECT cron_scrape_turno('Nocturna') $$);
