# Omega honest baseline — SQL para aplicar manualmente

**Cuándo aplicar:** una vez que se despliegue el fix de `lib/walkforward/lote-chunk.ts` (compras a módulo 100).
**Dónde aplicarlo:** Supabase Dashboard → SQL Editor → pegar el contenido completo de
`supabase/migrations/APPLY_MANUALLY_omega_rule_honest_baseline.sql` y ejecutar.

## Estado del backtest actual

- `walkforward_progress` marca todos los turnos como `completed` (última fecha 2026‑11‑10/11).
- Los resultados guardados en `walkforward_results` tienen el bug: se comparaban predicciones `00‑99` contra números oficiales `0000‑9999`, dando `is_hit = false` siempre.
- Tras aplicar:
  - Cada nuevo chunk (por ejemplo, cada 2 semanas) reescribirá los resultados con `upsert`.
  - La métrica de `is_hit` será coherente con la verificación real en `/api/mis-predicciones` (que usa `% 100`).

## Baseline matemático

Con 20 números sorteados entre 00–99 y 10 elegidos por el modelo:
- P(ningún aciertos) = C(80,10) / C(100,10) ≈ **9.51%**
- P(al menos 1 acierto) ≈ **90.49%**

El baseline aleatorio para `is_hit = TRUE` es ≈ 90.5%. El umbral anterior `0.15 (15%)` era incorrecto e inútil
(esencia: un modelo 100% aleatorio pasa, un modelo hambriento bien medido también pasa).
El umbral actualizado pide al menos ~90.5% + 1.5% margen de seguridad.

## Migración completa

Disponible en `supabase/migrations/APPLY_MANUALLY_omega_rule_honest_baseline.sql`.

Luego que se aplique, ejecutar en SQL Editor:

```sql
SELECT omega_rule_validation();
```

y verificar el mensaje. Si `omega_pass` = `true`, el backtest es coherente con el replay (esto sólo dice que la lotería es justa; no valida que el modelo tenga ventaja
adicional real).
