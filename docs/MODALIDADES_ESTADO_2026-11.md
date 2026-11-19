# Estado por modalidad — Quiniela IA (2026-11-18)

DATOS PRECISOS CORREGIDOS — la versión previa de este doc confundía
turnos individuales con modalidades y tenía pares no acordes.

Fuentes: BD producción (draws / poceada_federal_draws / brinco_draws /
prediction_history) consultada 2026-11-18.

## Censo por modalidad (partidas/sorteos reales guardados)

| Modalidad | Sorteos/picks | Alcance | Fuente |
|---|---|---|---|
| Quiniela Ciudad (Previa · Primera · Matutina · Vespertina · Nocturna) | **1210** | 2025-11-20 → 2026-11-18 | LOTBA oficial + consenso 3-fuente |
| Redoblonas (picks de usuarios — histórico verificado) | **237** picks verificados | 2026-11-18 | prediction_history |
| Poceada Ciudad | **301** | 2025-11-20 → 2026-11-18 | LOTBA Poceada |
| Poceada Federal (Santa Fe) | **2393** | 2021-06-22 → 2026-11-17 | IAFAS + extracto Santa Fe |
| Brinco | **30** | 2026-05-03 → 2026-11-15 | Extracto oficial CAS |

Draws jurisdicción Ciudad = **1210** (5 turnos).
Jurisdicciones: CABA 1210 · ciudad (Poceada Ciudad) 301 · provincia 291.

### Distribución por turno Ciudad (jurisdiccion=CABA/ciudad)

| Turno | Sorteos | Desde | Hasta |
|---|---|---|---|
| Previa | 301 | 2025-11-20 | 2026-11-18 |
| Primera | 151 | 2025-11-20 | 2026-11-18 |
| Matutina | 299 | 2025-11-20 | 2026-11-18 |
| Vespertina | 299 | 2025-11-20 | 2026-11-18 |
| Nocturna | 160 | 2025-11-20 | 2026-11-18 |

## Redoblonas

- Picks del usuario guardados: **237** (con redoblonas ≥1 par).
- Picks con al menos 1 par acertado: **9** (3.8%).
- Azar de un par específico ≈ 3.84 % ⇒ indistinguible del azar N=237.
- Criterio interno del sistema (par presente en los 20 del extracto, cualquier orden).
- No hay ventaja estadística o demostrada sobre el azar en redoblonas.
- El motor genera 5 jugadas por análisis (Plan Operativo) — ningún ace.

## OOS walk-forward por turno (census show guin 1569 folds por engine en todos los turnos)

Azar: P(al menos 1 de los top-10 aparece entre los 20 del extracto mod-100) ≈ 90.49%.

| Turno | V6 | V7 | ML | ENSEMBLE | Walk-forward winner |
|---|---|---|---|---|---|
| Previa | 52.1 [47–57] | 50.0 [45–55] | 51.9 [47–57] | 50.5 [46–55] | V6 ≈ ML ≈ ENS (empate) |
| Primera | 55.0 [48–62] | 46.4 [40–53] | 55.5 [49–62] | **59.7 [53.1–66.3]** | **ENSEMBLE** |
| Matutina | 46.5 [41–52] | 50.1 [45–55] | 39.6 [35–45] | 48.5 [43–54] | V7 (ruido, sin soporte bonferroni) |
| Vespertina | 56.8 [52–62] | 40.9 [36–46] | 55.7 [51–61] | **59.9 [54.8–65.0]** | **ENSEMBLE** |
| Nocturna | 42.7 [36–49] | 50.0 [43–57] | 37.7 [31–44] | 44.1 [38–51] | V7 (ruido) |
| **Global** | 51.0 | 47.5 | 48.4 | **52.5 [50–55]** | **ENSEMBLE** |

ICs amplios; ninguna ventaja robusta; ningún predictor válido con IC.
Recomendación: **ENSEMBLE queda como está en las 5 modalidades Ciudad**.
Promover un motor por turno = sobreajuste a ruido.

## Veredicto global por modalidad

| Modalidad | Veredicto |
|---|---|
| Quiniela Ciudad | Uniforme (χ²≈0.99-0.93, terminaciones ok). Ensemble > motores individuales en IC pero por debajo del azar 90.49%. Marca honesta. |
| Redoblonas | Picks de usuarios: 3.8% hits ≈ azar. Sin ventaje demostrable. Marcado en UI. |
| Poceada Ciudad | Uniforme χ² (p=0.999). 301 sorteos. Mismo veredicto. |
| Poceada Federal | Uniforme incluso con n=2393. Walk-forward dif. = −0.0048 (IC [−0.138, +0.129]) → sin ventaja. |
| Brinco | Sin advantage demostrado (modelo marca honestamente). |

## Notas honestas

1. No hay ninguna modalidad con ventaja OOS demostrable sobre el azar.
   El único lugar con potencia real (Poceada Federal, n=2393) respalda null.
2. Las "primeras 151"* de Primera son sorteos reales del rango
   2025-11-20 → 2026-11-18 (excluyendo domingos y feriados, y antes sólo se
   monitorea desde noviembre 2025, no antes).
3. walkforward_results refleja 1,569 folds por motor en Ciudad, no sorteos.
4. Las estadísticas de "Redoblonas" contabilizan picks del usuario, no
   universo de sorteos; universo de sorteos es el mismo de Ciudad (1,210).
