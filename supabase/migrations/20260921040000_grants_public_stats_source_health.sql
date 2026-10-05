-- ============================================================================
-- GRANT sobre materialized views públicas + tabla source_health
-- CONVERTIDO desde APPLY_MANUALLY_06_final_fix.sql (solo la parte de GRANT)
-- (auditoría 2026-10-05: los APPLY_MANUALLY_* no son migraciones versionadas)
--
-- Por qué migrar SOLO los GRANT:
--   * Son el único contenido real del fichero 06 que ninguna migración
--     versionada cubre (verificado por grep sobre 2026*.sql).
--   * Son idempotentes: re-entregar un GRANT sobre un privilegio ya concedido
--     es un no-op, por lo que la migración es segura sobre producción.
--   * Son necesarios en una BD nueva: supabase/config.toml ya NO auto-expone
--     objetos nuevos creados por `postgres` a los roles de la API sin GRANT
--     explícitos (comentario de auto_expose_new_tables: "new entities are NOT
--     auto-exposed, matching the new cloud default").
--
-- NO se migran (ya cubiertos o informativos):
--   * SELECT informativo sobre information_schema.routines (solo diagnóstico).
--   * api.calculate_omega_v6(p_turno, p_tier) — wrapper de firma ERRÓNEA:
--     la firma correcta vive en 20260911030000_fix_score_numbers_v6.sql:590
--     (api.calculate_omega_v6(text, text, date) + GRANT a service_role).
--     Si en algún entorno sobrevive el wrapper erróneo de 2 ARGUMENTOS que
--     creaba el fichero 06, dropearlo a mano:
--       DROP FUNCTION IF EXISTS api.calculate_omega_v6(TEXT, TEXT);
--     (era el paso 1 de APPLY_MANUALLY_07_omega_v6_fix.sql, retirado junto con
--      la recreación redundante del wrapper correcto.)
--
-- Timestamp backdated a 2026-09-21 04:00 (justo después de
-- 20260921020000_poceada_materialized_views.sql) para que los GRANT sobre
-- draw_stats / markov_transitions / cooccurrence_matrix se reapliquen DESPUÉS
-- de que esa migración hace DROP + CREATE de las MV (el DROP resetea los ACL
-- del objeto nuevo). El GRANT sobre source_health aplica a la tabla, que no se
-- recrea en ninguna otra migración.
-- ============================================================================

GRANT SELECT ON public.draw_stats TO anon, authenticated, service_role;
GRANT SELECT ON public.markov_transitions TO anon, authenticated, service_role;
GRANT SELECT ON public.cooccurrence_matrix TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.source_health TO service_role;
