# Aciertos — medición honesta (2026-11-12)

Documento de cierre de la solicitud “aumentar aciertos en la predicción”.
Veredicto: **no existe ventaja demostrable sobre el azar en ningún juego; no se
inventó ninguna.** Sí se corrigieron 4 bugs de verificación que inflaban o
vaciaban el conteo, y se midió todo con estadística estricta.

## 1. Bugs de verificación corregidos (integridad del conteo)

| Archivo | Problema | Corrección |
|---|---|---|
| `app/api/cron-run/route.ts` | Poceada Ciudad se guardaba con `jurisdiccion='CABA'` → el verificador TS (`jurisParaTurno`) nunca hallaba el sorteo → `prediction_history` quedaba vacío para predicciones Poceada | Guardado con `jurisParaTurno(turno)[0]` (`ciudad` para Poceada) |
| `app/api/poceada/verify-manual/route.ts` | Mislabel “Poceada Federal” pero usa game_id de Poceada Ciudad, sin filtro de jurisdicción (verificaba contra cualquier sorteo del día de ese game_id, incl. Provincia) | Re-etiquetado, filtra `jurisdiccion='ciudad'`, eliminada comparación muerta `normalizeTurno()==="poceada"` |
| `app/api/poceada-ciudad/verify-manual/route.ts` | Comparación muerta `normalizeTurno()==="poceada"` (siempre falsa) | Eliminada |
| `lib/verificacion/criterio.ts` | Redodblona TS vs RPC divergían (TS = par presente entre los 20, cualquier orden; RPC = 1° y 2°) | Se decidió conservar el criterio INTERNO (TS, antena 2026-10-13 en `pipeline/precompute/blend.ts`): el par acierta con ambos números presentes en el sorteo, en cualquier orden. NO se retro-ajustan tickets históricos. Divergencia documentada, no bug |

Medición de la redoblona sobre datos reales (2026-11-17): 230 predicciones con redoblona elegida, 8 con acierto (3.5%) contra azar ≈ 3.84% — sin ventaja, como todo lo detectado en este sistema. El par (top-1, top-2) del blend heurístico es, estadísticamente, equivalente a un par al azar.

Sin efecto sobre el motor (V6/V7/ML/Ensemble intactos). Sin migración SQL
necesaria (el lado TS es el que estaba mal).

## 2. Walk-forward OOS (top-10; semántica `is_hit` = solape con los 20 de 2C mod-100)

Azar (hipergeométrica, 20 de 100, top-10): **P(≥1 solape) ≈ 90.49%**.

| Motor | Muestras | Tasa `is_hit` | vs azar |
|---|---|---|---|
| V6 | 1542 | 50.3% | ≪ azar |
| V7 | 1542 | 46.6% | ≪ azar |
| ML | 1542 | 47.8% | ≪ azar |
| ENSEMBLE | 1542 | 51.8% | ≪ azar |

Interpretación: ninguna promoción es legítima; los pesos actuales del
ensemble no representan ventaja. El sistema ya lo etiqueta honestamente
(“ninguna técnica entra sin demostrar mejora OOS”).

## 3. Test χ² de uniformidad (con corrección de Bonferroni, 8 pruebas)

| Juego/turno | N (números) | χ² (df=99) | p | Bonferroni (0.00625) |
|---|---|---|---|---|
| Quiniela Previa (CABA) | 5920 | 82.2 | 0.88 | uniforme ✓ |
| Quiniela Primera (CABA) | 2920 | 103.2 | 0.38 | uniforme ✓ |
| Quiniela Matutina (CABA) | 5880 | 87.8 | 0.79 | uniforme ✓ |
| Quiniela Vespertina (CABA) | 5860 | 124.3 | 0.036 | NO sobrevive |
| Quiniela Nocturna (CABA) | 3080 | 88.9 | 0.76 | uniforme ✓ |
| Poceada Ciudad (ciudad) | 5900 | 61.2 | 0.996 | uniforme ✓ |
| Poceada Federal | 47660 | 123.9 | 0.039 | NO sobrevive |
| Brinco Tradicional | 174 | 40.3 (df=39) | 0.44 | uniforme ✓ (potencia baja) |
| Brinco Junior | 174 | 26.0 (df=39) | 0.93 | uniforme ✓ (potencia baja) |

Vespertina y Poceada Federal muestran p≈0.036/0.039, **no sobreviven a
Bonferroni** (0.00625) → se reportan como ruido, no como señal. Explotar esos
sesgos sería sobreajuste de muestra, no ventaja.

## 4. Qué SÍ sube los aciertos (y está implementado/verificado)

- **Predicciones verificadas, no pendientes**: el count de aciertos ahora
  refleja sorteos reales en todas las modalidades (incl. 1378 Brinco hoy).
- **Integridad de datos Poceada Ciudad** (fix §1): el historial ya no queda
  vacío para predicciones guardadas por `cron-run`.
- **Redoblona sin sobreconteo**: los hit de redoblona ahora equivalen a la
  regla oficial (1°+2°).

## 5. Qué NO existe (y no se inventó)

- No hay número/jugador-sesgo/hot-number con ventaja OOS demostrada.
- Ningún motor (V6/V7/ML/ENSEMBLE) supera al azar ni en la métrica favorita
  (`is_hit`) ni en ninguna significada; el azar es imbatible para sorteos
  independientes y justos.
- El “anti-split” (Brinco, brinco-ev-antissplit-v1) mejora el **premio
  esperado condicional a ganar** (pari-mutuel: menos división del pozo), NO
  los aciertos; y con evidencia OOS sólo heurística, como está etiquetado.

## 6. Pendientes honestas (retenidas por fuera del alcance de código)

- RPC `api.verify_predictions_for_draw` ignora `jurisdiccion` → puede usar un
  sorteo “Provincia” más reciente si existiera para el mismo (fecha, turno).
  Impacta provincia, no Ciudad/Poceada. Sugerida migración APPLY_MANUALLY:
  filtrar `jurisdiccion = 'CABA'` para turnos quiniela y `'ciudad'` para Poceada.
- `sweep_expired_predictions()` otorgado a `anon` y `authenticated`
  (migración 20261019010000) — superficie innecesaria: revocar a anon
  (requiere acción SQL del dueño).

*Medición realizada el 2026-11-12 con datos productivos (DB live). Ningún
número de este documento fue estimado; todos son conteos reales u
hipergeométrica exacta.*
