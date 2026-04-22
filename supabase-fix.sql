-- Script para corregir la tabla user_predictions en Supabase
-- Ejecutar esto en el SQL Editor de Supabase Dashboard

-- 1. Eliminar la foreign key constraint que bloquea inserciones
ALTER TABLE public.user_predictions DROP CONSTRAINT IF EXISTS user_predictions_user_id_fkey;

-- 2. Hacer user_id nullable (opcional)
ALTER TABLE public.user_predictions ALTER COLUMN user_id DROP NOT NULL;

-- 3. Verificar que quedóbien
-- SELECT column_name, is_nullable FROM information_schema.columns 
-- WHERE table_name = 'user_predictions';