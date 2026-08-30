-- Fix: get_draw_stats — numeric vs double precision type mismatch
-- draw_stats.avg_gap is numeric (from avg(int)), function expects double precision

CREATE OR REPLACE FUNCTION public.get_draw_stats(p_turno text)
 RETURNS TABLE(num integer, global_freq bigint, freq_7 bigint, freq_30 bigint, freq_90 bigint, last_seen_rank bigint, avg_gap double precision, total_draws bigint)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ds.num::INT,
    ds.global_freq,
    ds.freq_7,
    ds.freq_30,
    ds.freq_90,
    ds.last_seen_rank,
    ds.avg_gap::double precision,
    ds.total_draws
  FROM draw_stats ds
  WHERE ds.turno = p_turno
  ORDER BY ds.num;
END;
$function$;
