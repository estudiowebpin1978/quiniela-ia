export interface PredictionStats {
  atrasoActual: number;
  trendAcceleration: number;
  intervalDeviation: number;
  confidenceScore: number;
}

export function generateSEOAnalysis(
  predictedNumber: string,
  lottery: string,
  turno: string,
  dateStr: string,
  stats: PredictionStats
): string {
  const seed = parseInt(predictedNumber, 10) + new Date(dateStr).getDate();

  const intros = [
    `Para el sorteo de la Quiniela ${lottery} en el turno ${turno} de hoy, el número ${predictedNumber} se posiciona como una de las jugadas con mayor probabilidad estadística.`,
    `El análisis algorítmico para la Quiniela ${lottery} (${turno}) destaca al ${predictedNumber} basándose en su comportamiento histórico reciente.`,
    `Evaluando la matriz de resultados de la Quiniela ${lottery} ${turno}, nuestro modelo de IA ha aislado al número ${predictedNumber} como una recomendación de alta confiabilidad.`,
  ];

  const atrasosTexts = [
    `Actualmente, presenta un atraso de ${stats.atrasoActual} días sin salir a la cabeza, acercándose a su límite máximo de saturación.`,
    `Al registrar ${stats.atrasoActual} días de ausencia, su ciclo de aparición entra en una ventana matemática altamente favorable.`,
    `El historial marca un atraso de ${stats.atrasoActual} sorteos, lo que incrementa progresivamente su densidad de probabilidad.`,
  ];

  const factorTexts: string[] = [];

  if (stats.trendAcceleration > 1.2) {
    factorTexts.push(
      `Además, el motor detecta una fuerte aceleración de tendencia (${stats.trendAcceleration.toFixed(1)}x), indicando que el patrón de salidas en los últimos 10 sorteos está convergiendo rápidamente.`
    );
  } else {
    factorTexts.push(
      `El análisis de frecuencia muestra una tendencia estable, pero respaldada por un sólido historial en este turno particular.`
    );
  }

  if (stats.intervalDeviation > 0) {
    factorTexts.push(
      `Es fundamental destacar que su desviación de intervalo (${stats.intervalDeviation}) es positiva, superando el promedio histórico de espera.`
    );
  }

  const conclusions = [
    `Combinando estos 30 factores, el índice de calibración alcanza un ${stats.confidenceScore.toFixed(1)}%, convirtiéndolo en un pronóstico sólido.`,
    `El modelo predictivo le asigna una confianza de ${stats.confidenceScore.toFixed(1)}% para el extracto de hoy.`,
    `En conclusión, el cruce de datos arroja un nivel de fiabilidad del ${stats.confidenceScore.toFixed(1)}%, ideal para coberturas de 2 cifras.`,
  ];

  const intro = intros[seed % intros.length];
  const atrasoText = atrasosTexts[(seed + 1) % atrasosTexts.length];
  const factorText = factorTexts.join(" ");
  const conclusion = conclusions[(seed + 2) % conclusions.length];

  return `${intro} ${atrasoText} ${factorText} ${conclusion}`;
}

export function generateSEOAnalysisForTurno(
  predictions: Array<{ number: string; confidence: number; atrasoActual?: number; trendAcceleration?: number; intervalDeviation?: number }>,
  lottery: string,
  turno: string,
  dateStr: string
): string {
  const top3 = predictions.slice(0, 3);
  const numbers = top3.map(p => p.number.padStart(2, "0")).join(", ");
  const avgConfidence = top3.reduce((sum, p) => sum + p.confidence, 0) / top3.length;

  const seed = new Date(dateStr).getDate() + top3.reduce((s, p) => s + parseInt(p.number, 10), 0);

  const intros = [
    `Pronóstico Quiniela ${lottery} ${turno} (${dateStr}): Los números con mayor probabilidad estadística son ${numbers}, con una confianza promedio del ${avgConfidence.toFixed(1)}%.`,
    `Para el turno ${turno} de la Quiniela ${lottery} hoy ${dateStr}, el análisis destaca ${numbers} como las jugadas más probables (${avgConfidence.toFixed(1)}% confianza media).`,
    `El modelo de 30 factores para ${lottery} ${turno} (${dateStr}) sitúa a ${numbers} en el top 3 con ${avgConfidence.toFixed(1)}% de fiabilidad.`,
  ];

  const factorDescriptions = top3.map(p => {
    const pSeed = parseInt(p.number, 10) + new Date(dateStr).getDate();
    const factors: string[] = [];
    if ((p.trendAcceleration || 1) > 1.2) factors.push(`aceleración de tendencia ${(p.trendAcceleration || 1).toFixed(1)}x`);
    if ((p.intervalDeviation || 0) > 0) factors.push(`desviación de intervalo positiva ${p.intervalDeviation}`);
    if ((p.atrasoActual || 0) > 15) factors.push(`atraso de ${p.atrasoActual} días`);
    return factors.length > 0 ? `El ${p.number.padStart(2, "0")} muestra ${factors.join(" y ")}` : "";
  }).filter(Boolean).join(". ");

  const intro = intros[seed % intros.length];
  const conclusion = `El algoritmo evalúa frecuencia histórica, tendencias de aceleración, desviaciones de intervalo, patrones de transición y simulaciones Monte Carlo.`;

  return `${intro} ${factorDescriptions}. ${conclusion}`;
}