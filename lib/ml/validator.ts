import { ResultadoTraining, ModeloEntrenado } from './trainer';

export interface ResultadoValidacion {
  modelo: string;
  metricas: ValidacionMetricas;
  datos: ValidacionDatos;
  recomendaciones: string[];
}

export interface ValidacionMetricas {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  confusionMatrix: number[][];
  precisionPromedio: number;
  falsosPositivos: number;
  falsosNegativos: number;
}

export interface ValidacionDatos {
  predicciones: { predicho: number; real: number; correcto: boolean; distancia: number }[];
  resumen: {
    total: number;
    aciertos: number;
    fallos: number;
    tasaAcierto: number;
  };
}

export function validarModelo(
  modelo: ModeloEntrenado,
  datosTest: { features: number[]; etiqueta: number }[]
): ResultadoValidacion {
  const predicciones: { predicho: number; real: number; correcto: boolean; distancia: number }[] = [];

  for (const dato of datosTest) {
    let predicho: number;

    switch (modelo.tipo) {
      case 'random-forest':
        const { predecirRandomForest } = require('./random-forest');
        predicho = predecirRandomForest(modelo.modelo, dato.features).prediccion;
        break;
      case 'markov':
        const { predecirSiguienteMarkov } = require('./markov');
        const markovResult = predecirSiguienteMarkov(modelo.modelo, dato.features[0], 1);
        predicho = markovResult.proximoEstado;
        break;
      case 'neural':
        const { predecirRedNeuronal } = require('./neural');
        predicho = predecirRedNeuronal(modelo.modelo, dato.features).clasePredicha;
        break;
      default:
        predicho = 50;
    }

    const correcto = predicho === dato.etiqueta;
    const distancia = Math.min(
      Math.abs(predicho - dato.etiqueta),
      100 - Math.abs(predicho - dato.etiqueta)
    );

    predicciones.push({ predicho, real: dato.etiqueta, correcto, distancia });
  }

  const tp = predicciones.filter(p => p.correcto).length;
  const total = predicciones.length;
  const fp = total - tp;

  const confusionMatrix = [
    [tp, fp],
    [fp, tp]
  ];

  const accuracy = tp / total;
  const precision = tp / (tp + fp);
  const recall = tp / (tp + fp);
  const f1Score = 2 * (precision * recall) / (precision + recall);

  const distanciaPromedio = predicciones.reduce((sum, p) => sum + p.distancia, 0) / total;
  const precisionPromedio = Math.max(0, 100 - distanciaPromedio);

  const recomendaciones: string[] = [];

  if (accuracy < 0.3) {
    recomendaciones.push('Precisión muy baja. Se recomienda reentrenar con más datos.');
  } else if (accuracy < 0.5) {
    recomendaciones.push('Precisión moderada. Considerar ajustar hiperparámetros.');
  } else if (accuracy >= 0.7) {
    recomendaciones.push('Buena precisión. El modelo está listo para producción.');
  }

  if (distanciaPromedio > 20) {
    recomendaciones.push('Alto error promedio. Los números predichos están lejos de los reales.');
  }

  if (fp > total * 0.7) {
    recomendaciones.push('Muchas predicciones incorrectas. Revisar características.');
  }

  return {
    modelo: modelo.nombre,
    metricas: {
      accuracy: Math.round(accuracy * 10000) / 100,
      precision: Math.round(precision * 10000) / 100,
      recall: Math.round(recall * 10000) / 100,
      f1Score: Math.round(f1Score * 10000) / 100,
      confusionMatrix,
      precisionPromedio: Math.round(precisionPromedio * 100) / 100,
      falsosPositivos: fp,
      falsosNegativos: 0
    },
    datos: {
      predicciones: predicciones.slice(0, 100),
      resumen: {
        total,
        aciertos: tp,
        fallos: fp,
        tasaAcierto: Math.round((tp / total) * 10000) / 100
      }
    },
    recomendaciones
  };
}

export function realizarBacktest(
  predicciones: { fecha: string; turno: string; numeros: number[]; reales?: number[] }[],
  opciones: {
    topN?: number;
    diasPredecir?: number;
  } = {}
): {
  metricas: {
    tasaAcierto2Cifras: number;
    tasaAcierto3Cifras: number;
    tasaAcierto4Cifras: number;
    mejorTurno: string;
    peorTurno: string;
  };
  evolucion: { fecha: string; acierto: number }[];
  conclusiones: string[];
} {
  const { topN = 10, diasPredecir = 30 } = opciones;

  let acierto2 = 0, acierto3 = 0, acierto4 = 0;
  const fallosTurno: Record<string, number> = {};
  const aciertosTurno: Record<string, number> = {};

  predicciones.forEach(pred => {
    if (!pred.reales || pred.reales.length === 0) return;

    const realesSet = new Set(pred.reales.map(r => r % 100));

    pred.numeros.slice(0, topN).forEach(n => {
      if (realesSet.has(n % 100)) acierto2++;
    });

    const reales3Set = new Set(pred.reales.map(r => (r % 1000)));
    pred.numeros.slice(0, 5).forEach(n => {
      if (reales3Set.has(n % 1000)) acierto3++;
    });

    const reales4Set = new Set(pred.reales);
    pred.numeros.slice(0, 5).forEach(n => {
      if (reales4Set.has(n)) acierto4++;
    });

    const turnosKey = `${pred.fecha}-${pred.turno}`;
    if (pred.numeros.some(n => realesSet.has(n % 100))) {
      aciertosTurno[turnosKey] = (aciertosTurno[turnosKey] || 0) + 1;
    } else {
      fallosTurno[turnosKey] = (fallosTurno[turnosKey] || 0) + 1;
    }
  });

  const totalPreds = predicciones.length;

  const metricas = {
    tasaAcierto2Cifras: totalPreds > 0 ? Math.round((acierto2 / (totalPreds * topN)) * 10000) / 100 : 0,
    tasaAcierto3Cifras: totalPreds > 0 ? Math.round((acierto3 / (totalPreds * 5)) * 10000) / 100 : 0,
    tasaAcierto4Cifras: totalPreds > 0 ? Math.round((acierto4 / (totalPreds * 5)) * 10000) / 100 : 0,
    mejorTurno: Object.entries(aciertosTurno).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A',
    peorTurno: Object.entries(fallosTurno).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'
  };

  const evolucion: { fecha: string; acierto: number }[] = [];
  const conclusiones: string[] = [];

  if (metricas.tasaAcierto2Cifras > 30) {
    conclusiones.push('El modelo tiene buen rendimiento para 2 cifras.');
  } else {
    conclusiones.push('Rendimiento bajo para 2 cifras. Considerar ajustar el modelo.');
  }

  if (metricas.tasaAcierto2Cifras > metricas.tasaAcierto3Cifras) {
    conclusiones.push('Las predicciones de 2 cifras son más precisas que las de 3.');
  }

  return { metricas, evolucion, conclusiones };
}

export function compararModelos(
  resultados: ResultadoValidacion[]
): {
  mejorModelo: string;
  ranking: { modelo: string; accuracy: number }[];
  conclusion: string;
} {
  const ranking = resultados
    .map(r => ({ modelo: r.modelo, accuracy: r.metricas.accuracy }))
    .sort((a, b) => b.accuracy - a.accuracy);

  const mejorModelo = ranking[0]?.modelo || 'N/A';

  let conclusion = '';
  if (ranking.length > 1) {
    const diff = ranking[0].accuracy - ranking[1].accuracy;
    if (diff > 10) {
      conclusion = `${mejorModelo} es significativamente mejor que los demás.`;
    } else if (diff > 5) {
      conclusion = `${mejorModelo} supera a los demás por un margen moderado.`;
    } else {
      conclusion = 'Los modelos tienen rendimiento similar. Usar el más simple.';
    }
  }

  return { mejorModelo, ranking, conclusion };
}