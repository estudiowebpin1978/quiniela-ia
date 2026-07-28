import { type FactorDetail } from "@/lib/analisis/factores30";

export interface FactorExplanation {
  factor: number;
  name: string;
  value: number;
  description: string;
  impact: "positive" | "negative" | "neutral";
}

const FACTOR_DESCRIPTIONS: Record<number, { positive: string; negative: string; neutral: string }> = {
  1: {
    positive: "alta frecuencia histórica en los sorteos analizados",
    negative: "baja frecuencia histórica en los sorteos analizados",
    neutral: "frecuencia histórica dentro del promedio esperado",
  },
  2: {
    positive: "fuerte tendencia en el último mes",
    negative: "tendencia decreciente en el último mes",
    neutral: "tendencia estable en el último mes",
  },
  3: {
    positive: "patrón semanal favorable para este día",
    negative: "patrón semanal desfavorable para este día",
    neutral: "patrón semanal neutro para este día",
  },
  4: {
    positive: "ausencia actual prolongada, posible reversion a la media",
    negative: "presencia reciente, menor probabilidad de repetición inmediata",
    neutral: "ausencia actual dentro de parámetros normales",
  },
  5: {
    positive: "buen desempeño en la posición analizada",
    negative: "mal desempeño en la posición analizada",
    neutral: "desempeño promedio en la posición analizada",
  },
  6: {
    positive: "fuerte correlación con números calientes recientes",
    negative: "débil correlación con números calientes recientes",
    neutral: "correlación promedio con números calientes",
  },
  7: {
    positive: "patrón de transición favorable desde el último sorteo",
    negative: "patrón de transición desfavorable desde el último sorteo",
    neutral: "patrón de transición neutro",
  },
  8: {
    positive: "buena distribución en decenas analizadas",
    negative: "mala distribución en decenas analizadas",
    neutral: "distribución promedio en decenas",
  },
  9: {
    positive: "buena distribución en unidades analizadas",
    negative: "mala distribución en unidades analizadas",
    neutral: "distribución promedio en unidades",
  },
  10: {
    positive: "favorable según la Ley de Benford",
    negative: "desfavorable según la Ley de Benford",
    neutral: "neutro según la Ley de Benford",
  },
  11: {
    positive: "entropía favorable, mayor impredecibilidad controlada",
    negative: "entropía desfavorable, patrón muy predecible o caótico",
    neutral: "entropía dentro de rangos normales",
  },
  12: {
    positive: "fuerte señal de análisis espectral",
    negative: "débil señal de análisis espectral",
    neutral: "señal espectral promedio",
  },
  13: {
    positive: "aceleración de tendencia positiva detectada",
    negative: "desaceleración de tendencia detectada",
    neutral: "tendencia estable sin aceleración significativa",
  },
  14: {
    positive: "desviación de intervalo favorable",
    negative: "desviación de intervalo desfavorable",
    neutral: "intervalo dentro de la media histórica",
  },
  15: {
    positive: "patrón de pares/impares favorable",
    negative: "patrón de pares/impares desfavorable",
    neutral: "balance de pares/impares neutro",
  },
  16: {
    positive: "buen comportamiento en rangos numéricos",
    negative: "mal comportamiento en rangos numéricos",
    neutral: "comportamiento promedio en rangos",
  },
  17: {
    positive: "señal de Monte Carlo favorable",
    negative: "señal de Monte Carlo desfavorable",
    neutral: "señal de Monte Carlo neutra",
  },
};

export function generateFactorExplanations(
  factorDetails: FactorDetail[]
): FactorExplanation[] {
  return factorDetails.map((detail) => {
    const factorNum = detail.factor;
    const value = detail.score;
    const descriptions = FACTOR_DESCRIPTIONS[factorNum] || {
      positive: "señal favorable",
      negative: "señal desfavorable",
      neutral: "señal neutra",
    };

    let impact: "positive" | "negative" | "neutral" = "neutral";
    let description = descriptions.neutral;

    if (value > 0.6) {
      impact = "positive";
      description = descriptions.positive;
    } else if (value < 0.4) {
      impact = "negative";
      description = descriptions.negative;
    }

    return {
      factor: factorNum,
      name: detail.name,
      value,
      description,
      impact,
    };
  });
}

export function generatePredictionText(
  number: number,
  turno: string,
  fecha: string,
  factorDetails: FactorDetail[],
  confidence: number,
  topFactorsCount: number = 3
): string {
  const explanations = generateFactorExplanations(factorDetails);
  const positiveFactors = explanations
    .filter((f) => f.impact === "positive")
    .sort((a, b) => b.value - a.value)
    .slice(0, topFactorsCount);

  const negativeFactors = explanations
    .filter((f) => f.impact === "negative")
    .sort((a, b) => a.value - b.value)
    .slice(0, 2);

  const factorNames = positiveFactors.map((f) => f.description).join(" y ");
  const negativeNames = negativeFactors.map((f) => f.description).join(" y ");

  const confidenceLabel =
    confidence > 75
      ? "alta"
      : confidence > 50
        ? "moderada"
        : "baja";

  let text = `Para la Quiniela Nacional ${turno} del ${fecha}, el número ${number.toString().padStart(2, "0")} presenta una probabilidad ${confidenceLabel} (${confidence.toFixed(1)}%). `;

  if (positiveFactors.length > 0) {
    text += `Nuestro modelo detectó ${factorNames}. `;
  }

  if (negativeFactors.length > 0) {
    text += `Como contrapunto, se observaron ${negativeNames}. `;
  }

  text += `El análisis combina 30 factores estadísticos incluyendo frecuencia histórica, tendencias recientes, patrones de transición, entropía y simulaciones Monte Carlo.`;

  return text;
}

export function generateTurnoSummary(
  turno: string,
  fecha: string,
  predictions: Array<{ number: number; confidence: number; factors: FactorDetail[] }>
): string {
  const top3 = predictions.slice(0, 3);
  const numbers = top3.map((p) => p.number.toString().padStart(2, "0")).join(", ");
  const avgConfidence =
    top3.reduce((sum, p) => sum + p.confidence, 0) / top3.length;

  return `Pronóstico Quiniela Nacional ${turno} (${fecha}): Los números con mayor probabilidad estadística son ${numbers}, con una confianza promedio del ${avgConfidence.toFixed(1)}%. El algoritmo de 30 factores evalúa frecuencia histórica, tendencias de aceleración, desviaciones de intervalo, patrones de transición y simulaciones Monte Carlo para generar estas predicciones.`;
}