"use client";

import React from "react";

interface AnalysisParagraphProps {
  number: string;
  lottery: string;
  turno: string;
  dateStr: string;
  stats: {
    atrasoActual?: number;
    trendAcceleration?: number;
    intervalDeviation?: number;
    confidenceScore: number;
  };
  className?: string;
}

export function AnalysisParagraph({
  number,
  lottery,
  turno,
  dateStr,
  stats,
  className = "",
}: AnalysisParagraphProps) {
  const seed = parseInt(number, 10) + new Date(dateStr).getDate();

  const intros = [
    `Para el sorteo de la Quiniela ${lottery} en el turno ${turno} de hoy, el número ${number} se posiciona como una de las jugadas con mayor probabilidad estadística.`,
    `El análisis algorítmico para la Quiniela ${lottery} (${turno}) destaca al ${number} basándose en su comportamiento histórico reciente.`,
    `Evaluando la matriz de resultados de la Quiniela ${lottery} ${turno}, nuestro modelo de IA ha aislado al número ${number} como una recomendación de alta confiabilidad.`,
  ];

  const atrasosTexts = [
    `Actualmente, presenta un atraso de ${stats.atrasoActual} días sin salir a la cabeza, acercándose a su límite máximo de saturación.`,
    `Al registrar ${stats.atrasoActual} días de ausencia, su ciclo de aparición entra en una ventana matemática altamente favorable.`,
    `El historial marca un atraso de ${stats.atrasoActual} sorteos, lo que incrementa progresivamente su densidad de probabilidad.`,
  ];

  const factorTexts: string[] = [];

  if (typeof stats.trendAcceleration === "number" && stats.trendAcceleration > 1.2) {
    factorTexts.push(
      `Además, el motor detecta una fuerte aceleración de tendencia (${stats.trendAcceleration.toFixed(1)}x), indicando que el patrón de salidas en los últimos 10 sorteos está convergiendo rápidamente.`
    );
  } else {
    factorTexts.push(
      `El análisis de frecuencia muestra una tendencia estable, pero respaldada por un sólido historial en este turno particular.`
    );
  }

  if (typeof stats.intervalDeviation === "number" && stats.intervalDeviation > 0) {
    factorTexts.push(
      `Es fundamental destacar que su desviación de intervalo (${stats.intervalDeviation}) es positiva, superando el promedio histórico de espera.`
    );
  }

  const conclusions = [
    `Combinando estos factores y modelos ML, el índice de acuerdo entre motores alcanza un ${stats.confidenceScore.toFixed(1)}% (consistencia del modelo, no una probabilidad de acierto).`,
    `El modelo le asigna una consistencia interna de ${stats.confidenceScore.toFixed(1)}% al top de 2 cifras de este turno; el sorteo sigue siendo azar puro.`,
    `En conclusión, el cruce de datos arroja un índice de consistencia del ${stats.confidenceScore.toFixed(1)}% (los premios oficiales se pagan por acierto exacto, 1 en 100 por número).`,
  ];

  const intro = intros[seed % intros.length];
  const atrasoText =
    typeof stats.atrasoActual === "number"
      ? atrasosTexts[(seed + 1) % atrasosTexts.length]
      : "";
  const factorText = factorTexts.join(" ");
  // confidenceScore 0 = sin dato de consistencia (no se inventa un %).
  const conclusion =
    stats.confidenceScore > 0 ? conclusions[(seed + 2) % conclusions.length] : "";

  const fullText = [intro, atrasoText, factorText, conclusion].filter(Boolean).join(" ");

  return (
    <p
      className={`text-slate-300 text-base leading-relaxed font-mono text-sm ${className}`}
      itemProp="description"
    >
      {fullText}
    </p>
  );
}

interface TurnoSummaryProps {
  predictions: Array<{
    number: string;
    confidence: number;
    atrasoActual?: number;
    trendAcceleration?: number;
    intervalDeviation?: number;
  }>;
  lottery: string;
  turno: string;
  dateStr: string;
  className?: string;
}

export function TurnoSummary({
  predictions,
  lottery,
  turno,
  dateStr,
  className = "",
}: TurnoSummaryProps) {
  const top3 = predictions
    .filter((p) => typeof p.number === "string" && p.number !== "")
    .slice(0, 3);
  // Sin números reales no se emite resumen (nada de "00" fabricado).
  if (top3.length === 0) return null;
  const numbers = top3.map((p) => p.number.padStart(2, "0")).join(", ");
  const avgConfidence =
    top3.reduce((sum, p) => sum + p.confidence, 0) / top3.length;

  const seed =
    new Date(dateStr).getDate() +
    top3.reduce((s, p) => s + parseInt(p.number, 10), 0);

  const intros = [
    `Pronóstico Quiniela ${lottery} ${turno} (${dateStr}): Los números con mayor probabilidad estadística son ${numbers}, con una confianza promedio del ${avgConfidence.toFixed(1)}%.`,
    `Para el turno ${turno} de la Quiniela ${lottery} hoy ${dateStr}, el análisis destaca ${numbers} como las jugadas más probables (${avgConfidence.toFixed(1)}% confianza media).`,
    `El modelo de 20 factores para ${lottery} ${turno} (${dateStr}) sitúa a ${numbers} en el top 3 con ${avgConfidence.toFixed(1)}% de fiabilidad.`,
  ];
  // avgConfidence 0 = la API no envió consistencia (p.ej. path V6 en vivo):
  // se usa una variante sin % en lugar de publicar un 0.0% inventado.
  const introsSinConsistencia = [
    `Pronóstico Quiniela ${lottery} ${turno} (${dateStr}): Los números con mayor score del modelo son ${numbers} (sin índice de consistencia calculado para este turno).`,
  ];
  const introsPool = avgConfidence > 0 ? intros : introsSinConsistencia;

  const factorDescriptions = top3
    .map((p) => {
      const pSeed = parseInt(p.number, 10) + new Date(dateStr).getDate();
      const factors: string[] = [];
      if ((p.trendAcceleration || 1) > 1.2)
        factors.push(`aceleración de tendencia ${(p.trendAcceleration || 1).toFixed(1)}x`);
      if ((p.intervalDeviation || 0) > 0)
        factors.push(`desviación de intervalo positiva ${p.intervalDeviation}`);
      if ((p.atrasoActual || 0) > 15)
        factors.push(`atraso de ${p.atrasoActual} días`);
      return factors.length > 0
        ? `El ${p.number.padStart(2, "0")} muestra ${factors.join(" y ")}`
        : "";
    })
    .filter(Boolean)
    .join(". ");

  const intro = introsPool[seed % introsPool.length];
  const conclusion = `El algoritmo evalúa frecuencia histórica, ausencia, recencia, tendencia, ciclos, patrones de transición y simulaciones Monte Carlo (bootstrap).`;

  const fullText = [intro, factorDescriptions, conclusion].filter(Boolean).join(" ");

  return (
    <p
      className={`text-slate-400 text-sm leading-relaxed font-mono ${className}`}
      itemProp="description"
    >
      {fullText}
    </p>
  );
}