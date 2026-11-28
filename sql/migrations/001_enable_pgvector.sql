-- ─────────────────────────────────────────────────────────────
-- Migración 001: Habilitar pgvector en Supabase
-- ─────────────────────────────────────────────────────────────
-- Ejecutar en el SQL Editor de Supabase Dashboard
-- Requiere pgvector instalado (disponible en todos los proyectos Supabase)

CREATE EXTENSION IF NOT EXISTS vector;

-- Comentario para documentar
COMMENT ON EXTENSION vector IS 'Búsqueda de vectores para sorteos similares';
