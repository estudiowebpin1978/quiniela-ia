# AUDIT_PROGRESS — Quiniela IA

**Fecha:** 2026-11-11  
**Alias:** https://quiniela-ia-two.vercel.app/  
**Commits desplegados:** `87e8d26` → `7c9374c` → `4784d9d` → `761bd6f`

## Estado de esta sesión

| Bloque | Estado | Notas |
|---|---|---|
| Setup tests vitest | DONE | tsconfig incluye `lib/**`; `lib/__tests__/tsconfig.json`; 392 tests pasan. |
| Env CF en Vercel (CLOUDFLARE_ACCOUNT_ID / API_TOKEN / CF_EMBED_MODEL) | DONE | `vercel env add ... production` OK. |
| Poceada cache MMR (top10 → forzada 20) | DONE | `diversifyMMR(..., topN)`; cache viejo <16 inerte en predicción + precompute. |
| /poceada «Sin datos.» | DONE | Page condition 16 + invalida cache corto; requiere re-precompute nocturno. |
| OCR fallback (regex ciega eliminada) | DONE | Tesseract solo via `OCR_TESSERACT=1`; Gemini último recurso. |
| extractResultadosData | DONE | Bracket-matcher real; soporta `RESULTADOS_DATA` con/sin `window.` y comillas simples. |

## Hallazgos de Fase 1–2 (inventario)

### Fixes rápidos aplicados
1. NotificationBell usa `sb-access-token` (no existe en ningún lugar) → campana no carga nunca. **Fix aplicado.**
2. `/api/poceada-federal/combinaciones/page.tsx` — fallback a demo falso («premium · datos oficiales») ante cualquier error. **Fix aplicado.**
3. `/poceada` — banner «Resultado oficial» hardcoded con números fijos. **Fix aplicado.**
4. `/terminos` — «no procesa dinero» contradice pasarela de pago. **Fix aplicado.**
5. `/rendimiento` — 3c/4c fabricados `hits_2 * 0.3 / 0.1`. **Fix aplicado.**
6. `/pronostico/[fecha]/[turno]` — turno ignorado, duplicados SEO. **Fix aplicado.**
7. Dead links: `/mis-predicciones` (no existe), `/pronostico` (no existe), `/risultati` (no existe). **Fix aplicado.**

### Pendientes / NOT VERIFIED
- Autenticación con cuenta real gratuita y premium — requiere credenciales.
- Pagos Ualá Bis real (checkout + webhook + activación automática) — requiere credenciales Ualá.
- Transferencias por WhatsApp — requiere admin real.
- Crons externos en cron-job.org — NO verificable desde este entorno.
- Backtest/Omega — motor congelado; solo análisis estático.
- RLS — requiere acceso de lectura a Supabase (se verificó vía RPC anon solo lectura).

## Estado de los dos subagentes
- Inventario API routes: 79 archivos.
- Inventario páginas: 16 rutas.
